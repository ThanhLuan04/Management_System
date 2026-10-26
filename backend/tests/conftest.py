"""
Cấu hình pytest dùng chung.

Test chạy trên database riêng (TEST_DATABASE_URL, ví dụ smartstore_test), KHÔNG BAO GIỜ trên DB dev.
Phải đổi DATABASE_URL trước khi import bất kỳ module nào tạo engine (app.db.session, app.main).
"""

import os

from app.core.config import BACKEND_DIR, Settings, get_settings

_base = Settings()
if not _base.test_database_url:
    raise RuntimeError("Thiếu TEST_DATABASE_URL trong backend/.env")
if _base.test_database_url == _base.database_url or not _base.test_database_url.rstrip("/").endswith("_test"):
    raise RuntimeError("TEST_DATABASE_URL phải khác DATABASE_URL và tên database phải kết thúc bằng '_test'")

os.environ["DATABASE_URL"] = _base.test_database_url
os.environ["ENVIRONMENT"] = "test"
get_settings.cache_clear()

import pytest  # noqa: E402
from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.api.v1.auth import login_rate_limiter  # noqa: E402
from app.core.permissions import RoleCode  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.db.session import SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Role, User  # noqa: E402

DEFAULT_PASSWORD = "Passw0rd!"
# Hash một lần cho cả phiên test: Argon2 cố ý chậm, hash lại cho mỗi user làm test chậm đáng kể
_DEFAULT_PASSWORD_HASH = hash_password(DEFAULT_PASSWORD)


@pytest.fixture(scope="session", autouse=True)
def _migrated_database():
    """Dựng lại schema từ đầu bằng chính migration — đồng thời kiểm tra downgrade/upgrade chạy được."""
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    command.downgrade(config, "base")
    command.upgrade(config, "head")
    yield
    engine.dispose()


@pytest.fixture(autouse=True)
def _clean_tables():
    """Mỗi test bắt đầu với dữ liệu sạch (giữ lại roles/settings đã seed bởi migration)."""
    with engine.begin() as conn:
        conn.execute(text("DELETE FROM audit_logs"))
        conn.execute(text("DELETE FROM refresh_tokens"))
        conn.execute(text("UPDATE settings SET updated_by = NULL"))
        conn.execute(text("DELETE FROM users"))
    login_rate_limiter.reset()
    yield


@pytest.fixture
def db():
    with SessionLocal() as session:
        yield session


@pytest.fixture
def client():
    # https để trình khách test gửi kèm cookie Secure như trình duyệt thật
    with TestClient(app, base_url="https://testserver") as test_client:
        yield test_client


@pytest.fixture
def make_user(db):
    def _make_user(
        username: str,
        role: RoleCode = RoleCode.CASHIER,
        password: str | None = None,
        is_active: bool = True,
        full_name: str | None = None,
    ) -> User:
        role_obj = db.query(Role).filter_by(code=role).one()
        user = User(
            username=username,
            password_hash=hash_password(password) if password else _DEFAULT_PASSWORD_HASH,
            full_name=full_name or username.title(),
            role=role_obj,
            is_active=is_active,
        )
        db.add(user)
        db.commit()
        return user

    return _make_user


def login(client: TestClient, username: str, password: str = DEFAULT_PASSWORD):
    return client.post("/api/v1/auth/login", json={"username": username, "password": password})


@pytest.fixture
def auth_headers(client, make_user):
    """Tạo user theo vai trò, đăng nhập, trả về header Authorization."""

    def _auth_headers(role: RoleCode = RoleCode.ADMIN, username: str | None = None) -> dict[str, str]:
        username = username or role.lower()
        make_user(username, role)
        response = login(client, username)
        assert response.status_code == 200, response.text
        return {"Authorization": f"Bearer {response.json()['access_token']}"}

    return _auth_headers
