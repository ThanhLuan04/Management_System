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


# Thông báo tiếng Việt cho các lỗi validate phổ biến của Pydantic (frontend hiển thị ngay dưới ô nhập)
_VALIDATION_MESSAGES = {
    "missing": "Trường này là bắt buộc",
    "extra_forbidden": "Trường này không được phép gửi lên",
    "string_type": "Phải là chuỗi ký tự",
    "string_too_short": "Tối thiểu {min_length} ký tự",
    "string_too_long": "Tối đa {max_length} ký tự",
    "string_pattern_mismatch": "Sai định dạng",
    "int_parsing": "Phải là số nguyên",
    "int_type": "Phải là số nguyên",
    "int_from_float": "Phải là số nguyên",
    "decimal_parsing": "Phải là số",
    "decimal_type": "Phải là số",
    "bool_parsing": "Phải là true hoặc false",
    "bool_type": "Phải là true hoặc false",
    "greater_than": "Phải lớn hơn {gt}",
    "greater_than_equal": "Phải lớn hơn hoặc bằng {ge}",
    "less_than": "Phải nhỏ hơn {lt}",
    "less_than_equal": "Phải nhỏ hơn hoặc bằng {le}",
    "enum": "Chỉ chấp nhận: {expected}",
    "literal_error": "Chỉ chấp nhận: {expected}",
    "list_type": "Phải là danh sách",
    "too_short": "Cần ít nhất {min_length} phần tử",
    "too_long": "Tối đa {max_length} phần tử",
    "model_attributes_type": "Sai kiểu dữ liệu",
    "dict_type": "Phải là object",
    "uuid_parsing": "Phải là UUID hợp lệ",
    "date_from_datetime_parsing": "Ngày không hợp lệ (định dạng YYYY-MM-DD)",
    "date_parsing": "Ngày không hợp lệ (định dạng YYYY-MM-DD)",
}


def _validation_message(err: dict) -> str:
    error_type = err.get("type", "")
    ctx = err.get("ctx") or {}
    if error_type == "value_error" and "error" in ctx:
        # Lỗi do validator của mình ném ra (đã viết tiếng Việt) — bỏ tiền tố "Value error, " của Pydantic
        return str(ctx["error"])
    if error_type == "value_error" and "email" in err.get("msg", "").lower():
        return "Email không hợp lệ"
    template = _VALIDATION_MESSAGES.get(error_type)
    if template is None:
        return err.get("msg", "Giá trị không hợp lệ")
    try:
        return template.format(**ctx)
    except (KeyError, IndexError):
        return template


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
        details = []
        for err in exc.errors():
            loc = tuple(err.get("loc", ()))
            if err.get("type") == "json_invalid":
                # loc = ("body", <vị trí ký tự>) — đó là vị trí lỗi cú pháp, không phải tên trường
                position = loc[1] if len(loc) > 1 else "?"
                details.append(
                    {"field": "body", "message": f"Body không phải JSON hợp lệ (lỗi ở ký tự thứ {position})"}
                )
                continue
            # Không trả lại "input" của người dùng, tránh phản hồi lại mật khẩu trong thông báo lỗi
            details.append({"field": _field_path(loc), "message": _validation_message(err)})
        return error_response(422, "VALIDATION_ERROR", "Dữ liệu không hợp lệ", details)

    @app.exception_handler(StarletteHTTPException)
    async def handle_http_error(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        code, message = _HTTP_ERROR_CODES.get(exc.status_code, ("HTTP_ERROR", "Yêu cầu không thể xử lý"))
        return error_response(exc.status_code, code, message, headers=getattr(exc, "headers", None))
