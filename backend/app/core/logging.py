import json
import logging
import time
import uuid
from contextvars import ContextVar

from starlette.types import ASGIApp, Message, Receive, Scope, Send

request_id_ctx: ContextVar[str] = ContextVar("request_id", default="-")

logger = logging.getLogger("app.request")


class RequestIdFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_ctx.get()
        return True


def setup_logging(level: str = "INFO") -> None:
    handler = logging.StreamHandler()
    handler.addFilter(RequestIdFilter())
    handler.setFormatter(
        logging.Formatter("%(asctime)s %(levelname)-7s [%(request_id)s] %(name)s: %(message)s")
    )

    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(level)

    # Dùng access log riêng (có request_id, không có query string) thay cho access log của uvicorn
    logging.getLogger("uvicorn.access").disabled = True


class RequestContextMiddleware:
    """
    Gắn X-Request-ID cho mỗi request, ghi access log và bắt mọi lỗi chưa được xử lý.

    Lỗi bất ngờ được ghi đầy đủ traceback vào log server, nhưng client chỉ nhận
    {"error": {"code": "INTERNAL_ERROR", ...}} kèm request_id để đối chiếu — không lộ stack trace.
    Viết dạng ASGI thuần (không dùng BaseHTTPMiddleware) để contextvar request_id có hiệu lực trong toàn bộ request.
    """

    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request_id = uuid.uuid4().hex
        token = request_id_ctx.set(request_id)
        started = time.perf_counter()
        status_code = 500
        response_started = False

        async def send_with_request_id(message: Message) -> None:
            nonlocal status_code, response_started
            if message["type"] == "http.response.start":
                response_started = True
                status_code = message["status"]
                message.setdefault("headers", [])
                message["headers"].append((b"x-request-id", request_id.encode()))
            await send(message)

        try:
            await self.app(scope, receive, send_with_request_id)
        except Exception:
            logger.exception("Unhandled error")
            if response_started:
                raise
            body = json.dumps(
                {
                    "error": {
                        "code": "INTERNAL_ERROR",
                        "message": "Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau.",
                        "details": {"request_id": request_id},
                    }
                }
            ).encode()
            await send_with_request_id(
                {
                    "type": "http.response.start",
                    "status": 500,
                    "headers": [
                        (b"content-type", b"application/json"),
                        (b"content-length", str(len(body)).encode()),
                    ],
                }
            )
            await send({"type": "http.response.body", "body": body})
        finally:
            duration_ms = (time.perf_counter() - started) * 1000
            # Chỉ ghi method + path; không ghi query string, header hay body (có thể chứa dữ liệu nhạy cảm)
            logger.info("%s %s %s %.1fms", scope["method"], scope["path"], status_code, duration_ms)
            request_id_ctx.reset(token)
