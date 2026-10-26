from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi
from fastapi.staticfiles import StaticFiles

from app.api.v1.router import api_router
from app.core.config import get_settings
from app.core.errors import register_exception_handlers
from app.core.logging import RequestContextMiddleware, setup_logging
from app.schemas.common import ErrorBody, ErrorDetail, ErrorResponse

settings = get_settings()
setup_logging(settings.log_level)

app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    # Swagger chỉ bật ngoài production
    docs_url=None if settings.is_production else "/docs",
    redoc_url=None,
    openapi_url=None if settings.is_production else "/openapi.json",
)

register_exception_handlers(app)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,  # cần cho cookie refresh token
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type", "Idempotency-Key"],
    expose_headers=["X-Request-ID"],
)
# Thêm sau cùng = lớp ngoài cùng: mọi response (kể cả lỗi CORS, lỗi 500) đều có X-Request-ID và access log
app.add_middleware(RequestContextMiddleware)

app.include_router(api_router, prefix="/api/v1")


def custom_openapi() -> dict:
    """
    FastAPI mặc định mô tả lỗi 422 theo dạng {"detail": [...]}, nhưng API thực tế trả {"error": {...}}.
    Thay mô tả đó bằng ErrorResponse để Swagger khớp với response thật.
    """
    if app.openapi_schema:
        return app.openapi_schema
    schema = get_openapi(title=app.title, version=app.version, routes=app.routes)
    components = schema.setdefault("components", {}).setdefault("schemas", {})
    components.update(
        {
            name: model.model_json_schema(ref_template="#/components/schemas/{model}")
            for name, model in (
                ("ErrorDetail", ErrorDetail),
                ("ErrorBody", ErrorBody),
                ("ErrorResponse", ErrorResponse),
            )
        }
    )
    for name in ("ErrorDetail", "ErrorBody", "ErrorResponse"):
        components[name].pop("$defs", None)
    components.pop("HTTPValidationError", None)
    components.pop("ValidationError", None)

    error_content = {"application/json": {"schema": {"$ref": "#/components/schemas/ErrorResponse"}}}
    for path_item in schema.get("paths", {}).values():
        for operation in path_item.values():
            responses = operation.get("responses", {})
            if "422" in responses:
                responses["422"] = {"description": "Dữ liệu không hợp lệ", "content": error_content}
    app.openapi_schema = schema
    return schema


app.openapi = custom_openapi

# Ảnh sản phẩm (MVP lưu trên đĩa server). Chỉ phục vụ file nằm trong upload_dir.
settings.upload_dir.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=settings.upload_dir), name="uploads")
