from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router
from app.core.config import get_settings
from app.core.errors import register_exception_handlers
from app.core.logging import RequestContextMiddleware, setup_logging

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
