from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    """Cấu hình đọc từ biến môi trường, hoặc từ backend/.env khi chạy cục bộ."""

    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "SmartStore API"
    environment: Literal["development", "test", "production"] = "development"
    log_level: str = "INFO"

    database_url: str
    test_database_url: str | None = None

    # Chuỗi phân cách bằng dấu phẩy, ví dụ "http://localhost:5173,https://smartstore.example.com"
    cors_origins: str = "http://localhost:5173"

    jwt_secret_key: str
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7

    # Chống dò mật khẩu
    login_max_failed_attempts: int = 5
    login_lock_minutes: int = 15
    login_rate_limit_per_minute: int = 10

    # Quên mật khẩu: mã 6 số gửi qua email
    password_reset_code_minutes: int = 15
    password_reset_max_attempts: int = 5
    password_reset_cooldown_seconds: int = 60  # không gửi mã mới cho cùng tài khoản trong khoảng này

    # Gửi email (Gmail: smtp.gmail.com, cổng 587, mật khẩu ứng dụng). Bỏ trống SMTP_HOST:
    # môi trường dev in mã ra log để thử; production không gửi được (ghi log lỗi, không ghi mã).
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_username: str | None = None
    smtp_password: str | None = None
    smtp_from: str | None = None

    # Ảnh sản phẩm lưu trên đĩa server (MVP); được phục vụ tại /uploads/...
    upload_dir: Path = BACKEND_DIR / "uploads"
    max_image_bytes: int = 2 * 1024 * 1024

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def is_production(self) -> bool:
        return self.environment == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()
