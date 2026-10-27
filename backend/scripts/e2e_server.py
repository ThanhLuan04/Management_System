"""
Khởi động backend cho test end-to-end (Playwright): dựng lại database test từ đầu, tạo tài khoản Admin E2E
rồi chạy uvicorn ở cổng 8001. Playwright tự gọi script này (frontend/playwright.config.ts).

Dùng TEST_DATABASE_URL (database tên kết thúc bằng "_test") — KHÔNG BAO GIỜ đụng tới DB dev.
Không chạy pytest cùng lúc với E2E vì cả hai cùng xóa và dựng lại database này.

Chạy tay (tại thư mục backend):
    .\\.venv\\Scripts\\python.exe -m scripts.e2e_server           # database trống + Admin E2E
    .\\.venv\\Scripts\\python.exe -m scripts.e2e_server --demo    # thêm dữ liệu demo (chụp ảnh màn hình)
"""

import argparse
import os
import sys
import tempfile

from app.core.config import BACKEND_DIR, Settings, get_settings

E2E_PORT = 8001
E2E_FRONTEND_ORIGIN = "http://localhost:5174"
# Chỉ dùng trên database test bị xóa sau mỗi lần chạy — Playwright dùng cùng giá trị (frontend/e2e/support.ts)
E2E_ADMIN = {"username": "e2e_admin", "password": "E2eAdmin123", "full_name": "Admin E2E"}


def _use_test_database() -> None:
    base = Settings()
    url = base.test_database_url
    if not url or url == base.database_url or not url.rstrip("/").endswith("_test"):
        raise SystemExit(
            "Cần TEST_DATABASE_URL (tên database kết thúc bằng '_test', khác DATABASE_URL) trong backend/.env"
        )
    os.environ.update(
        DATABASE_URL=url,
        ENVIRONMENT="test",
        CORS_ORIGINS=E2E_FRONTEND_ORIGIN,
        ACCESS_TOKEN_EXPIRE_MINUTES="15",
        LOG_LEVEL="WARNING",
        # Mỗi test E2E đăng nhập lại từ đầu; giới hạn 10 lần/phút/IP đã có test riêng ở pytest
        LOGIN_RATE_LIMIT_PER_MINUTE="100",
        UPLOAD_DIR=tempfile.mkdtemp(prefix="smartstore-e2e-uploads-"),
    )
    get_settings.cache_clear()


def _reset_database() -> None:
    from alembic import command
    from alembic.config import Config

    config = Config(str(BACKEND_DIR / "alembic.ini"))
    command.downgrade(config, "base")
    command.upgrade(config, "head")


def _create_admin() -> None:
    from app.core.permissions import RoleCode
    from app.db.session import SessionLocal
    from app.models import Role
    from app.schemas.user import UserCreate
    from app.services import user_service

    with SessionLocal() as db:
        role = db.query(Role).filter_by(code=RoleCode.ADMIN).one()
        user_service.create_user(db, UserCreate(**E2E_ADMIN, role_id=role.id), actor_id=None)


def main() -> int:
    parser = argparse.ArgumentParser(description="Backend cho E2E / chụp ảnh màn hình")
    parser.add_argument(
        "--demo", action="store_true", help="Nạp dữ liệu demo 60 ngày (dùng khi chụp ảnh màn hình)"
    )
    args = parser.parse_args()

    _use_test_database()
    _reset_database()
    _create_admin()
    if args.demo:
        from scripts.seed_demo import seed

        seed(days=60, reset=False)

    import uvicorn

    uvicorn.run("app.main:app", host="127.0.0.1", port=E2E_PORT, log_level="warning")
    return 0


if __name__ == "__main__":
    sys.exit(main())
