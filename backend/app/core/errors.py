import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger(__name__)


class AppError(Exception):
    """Lỗi nghiệp vụ có chủ đích. Được chuyển thành response {"error": {...}} thống nhất."""

    def __init__(
        self,
        code: str,
        message: str,
        status_code: int = 400,
        details: Any = None,
        headers: dict[str, str] | None = None,
    ):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details
        self.headers = headers


def error_response(
    status_code: int,
    code: str,
    message: str,
    details: Any = None,
    headers: dict[str, str] | None = None,
) -> JSONResponse:
    body: dict[str, Any] = {"code": code, "message": message}
    if details is not None:
        body["details"] = details
    return JSONResponse(status_code=status_code, content={"error": body}, headers=headers)


# Các mã HTTP mà FastAPI/Starlette tự sinh (sai route, sai method, ...)
_HTTP_ERROR_CODES = {
    400: ("BAD_REQUEST", "Yêu cầu không hợp lệ"),
    401: ("UNAUTHORIZED", "Vui lòng đăng nhập"),
    403: ("FORBIDDEN", "Bạn không có quyền thực hiện thao tác này"),
    404: ("NOT_FOUND", "Không tìm thấy tài nguyên"),
    405: ("METHOD_NOT_ALLOWED", "Phương thức không được hỗ trợ"),
    413: ("PAYLOAD_TOO_LARGE", "Dữ liệu gửi lên quá lớn"),
}


def _field_path(loc: tuple) -> str:
    # Bỏ phần đầu "body"/"query"/"path" để còn tên trường, ví dụ ("body", "items", 0, "quantity") → items.0.quantity
    parts = loc[1:] if loc and loc[0] in ("body", "query", "path", "header", "cookie") else loc
    return ".".join(str(p) for p in parts) or str(loc[0] if loc else "")


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def handle_app_error(_: Request, exc: AppError) -> JSONResponse:
        return error_response(exc.status_code, exc.code, exc.message, exc.details, exc.headers)

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        details = [
            # Không trả lại "input" của người dùng, tránh phản hồi lại mật khẩu trong thông báo lỗi
            {"field": _field_path(tuple(err.get("loc", ()))), "message": err.get("msg", "")}
            for err in exc.errors()
        ]
        return error_response(422, "VALIDATION_ERROR", "Dữ liệu không hợp lệ", details)

    @app.exception_handler(StarletteHTTPException)
    async def handle_http_error(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        code, message = _HTTP_ERROR_CODES.get(exc.status_code, ("HTTP_ERROR", "Yêu cầu không thể xử lý"))
        return error_response(exc.status_code, code, message, headers=getattr(exc, "headers", None))
