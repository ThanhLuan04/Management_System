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

    database_url: str
    test_database_url: str | None = None

    # Chuỗi phân cách bằng dấu phẩy, ví dụ "http://localhost:5173,https://smartstore.example.com"
    cors_origins: str = "http://localhost:5173"

    jwt_secret_key: str

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def is_production(self) -> bool:
        return self.environment == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()
