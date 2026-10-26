import logging
from datetime import timedelta

from sqlalchemy import select

from app.core.config import get_settings
from app.core.permissions import RoleCode
from app.models import AuditLog, RefreshToken, User
from app.utils.time import utcnow
from tests.conftest import DEFAULT_PASSWORD, login

ME = "/api/v1/auth/me"
REFRESH = "/api/v1/auth/refresh"
LOGOUT = "/api/v1/auth/logout"
CHANGE_PASSWORD = "/api/v1/auth/change-password"


def bearer(response) -> dict[str, str]:
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def replay_refresh_token(client, raw_token: str):
    """Gửi lại một refresh token cụ thể (giả lập token bị đánh cắp / thiết bị khác)."""
    client.cookies.clear()
    client.cookies.set("refresh_token", raw_token, domain="testserver.local", path="/api/v1/auth")
    return client.post(REFRESH)


def reuse_detections(db) -> int:
    # Chỉ tăng khi server THỰC SỰ nhận được token đã thu hồi → chứng minh test không đạt "nhờ" thiếu cookie
    return len(db.scalars(select(AuditLog).where(AuditLog.action == "REFRESH_TOKEN_REUSE")).all())


# --- Đăng nhập ---


def test_login_success_returns_token_user_and_httponly_refresh_cookie(client, make_user):
    make_user("thungan", RoleCode.CASHIER)

    response = login(client, "ThuNgan")  # username không phân biệt hoa thường

    assert response.status_code == 200
    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["expires_in"] == get_settings().access_token_expire_minutes * 60
    assert body["user"]["username"] == "thungan"
    assert body["user"]["role"]["code"] == "CASHIER"
    assert "orders.create" in body["user"]["permissions"]
    assert "users.manage" not in body["user"]["permissions"]

    cookie = response.headers["set-cookie"]
    assert cookie.startswith("refresh_token=")
    for attribute in ("HttpOnly", "Secure", "SameSite=strict", "Path=/api/v1/auth"):
        assert attribute.lower() in cookie.lower()


def test_wrong_password_and_unknown_user_get_identical_response(client, make_user):
    make_user("admin", RoleCode.ADMIN)

    wrong_password = login(client, "admin", "Sai12345")
    unknown_user = login(client, "khongco", "Sai12345")

    assert wrong_password.status_code == unknown_user.status_code == 401
    assert wrong_password.json() == unknown_user.json()
    assert wrong_password.json()["error"]["code"] == "INVALID_CREDENTIALS"


def test_account_locks_after_five_failures_even_for_correct_password(client, make_user, db):
    make_user("admin", RoleCode.ADMIN)

    for _ in range(4):
        assert login(client, "admin", "Sai12345").json()["error"]["code"] == "INVALID_CREDENTIALS"
    fifth = login(client, "admin", "Sai12345")
    assert fifth.status_code == 403
    assert fifth.json()["error"]["code"] == "ACCOUNT_LOCKED"

    # Đúng mật khẩu nhưng vẫn đang bị khóa
    assert login(client, "admin").json()["error"]["code"] == "ACCOUNT_LOCKED"

    # Hết thời gian khóa → đăng nhập lại được
    user = db.scalar(select(User).where(User.username == "admin"))
    user.locked_until = utcnow() - timedelta(seconds=1)
    db.commit()
    assert login(client, "admin").status_code == 200


def test_disabled_account_cannot_log_in(client, make_user):
    make_user("nghiviec", is_active=False)

    response = login(client, "nghiviec")

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "ACCOUNT_DISABLED"


def test_disabled_status_is_not_revealed_to_wrong_password(client, make_user):
    make_user("nghiviec", is_active=False)

    assert login(client, "nghiviec", "Sai12345").json()["error"]["code"] == "INVALID_CREDENTIALS"


def test_login_is_rate_limited_per_ip(client):
    codes = [login(client, "khongco", "Sai12345").status_code for _ in range(11)]

    assert codes[:10] == [401] * 10
    assert codes[10] == 429


def test_login_writes_audit_log_without_password(client, make_user, db):
    make_user("admin", RoleCode.ADMIN)
    login(client, "admin", "Sai12345")
    login(client, "admin")

    actions = db.scalars(select(AuditLog.action).order_by(AuditLog.id)).all()
    assert actions == ["LOGIN_FAILED", "LOGIN_SUCCESS"]
    for log in db.scalars(select(AuditLog)):
        assert "Sai12345" not in str(log.new_values) and DEFAULT_PASSWORD not in str(log.new_values)


def test_password_and_tokens_never_appear_in_logs(client, make_user, caplog):
    make_user("admin", RoleCode.ADMIN)
    with caplog.at_level(logging.DEBUG):
        response = login(client, "admin")
        client.get(ME, headers=bearer(response))

    assert DEFAULT_PASSWORD not in caplog.text
    assert response.json()["access_token"] not in caplog.text
    assert response.cookies["refresh_token"] not in caplog.text


# --- Truy cập API bằng access token ---


def test_me_requires_valid_token(client, make_user):
    make_user("admin", RoleCode.ADMIN)

    assert client.get(ME).json()["error"]["code"] == "UNAUTHORIZED"
    assert client.get(ME, headers={"Authorization": "Bearer abc"}).status_code == 401

    response = client.get(ME, headers=bearer(login(client, "admin")))
    assert response.status_code == 200
    assert response.json()["username"] == "admin"


def test_disabled_user_token_stops_working_immediately(client, make_user, db):
    user = make_user("thungan")
    headers = bearer(login(client, "thungan"))

    user.is_active = False
    db.commit()

    assert client.get(ME, headers=headers).status_code == 401


# --- Refresh token ---


def test_refresh_rotates_token_and_detects_reuse(client, make_user, db):
    make_user("admin", RoleCode.ADMIN)
    login(client, "admin")
    first_cookie = client.cookies["refresh_token"]

    refreshed = client.post(REFRESH)
    assert refreshed.status_code == 200
    assert client.get(ME, headers=bearer(refreshed)).status_code == 200
    second_cookie = client.cookies["refresh_token"]
    assert second_cookie != first_cookie

    # Kẻ gian dùng lại token cũ → bị từ chối, đồng thời mọi phiên của user bị thu hồi
    reused = replay_refresh_token(client, first_cookie)
    assert reused.status_code == 401
    assert reuse_detections(db) == 1
    assert db.scalar(select(RefreshToken).where(RefreshToken.revoked_at.is_(None))) is None

    # Token mới nhất (của người dùng thật) cũng không còn dùng được
    assert replay_refresh_token(client, second_cookie).status_code == 401
    assert reuse_detections(db) == 2


def test_refresh_without_cookie_is_unauthorized(client):
    response = client.post(REFRESH)

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHORIZED"


def test_refresh_rejects_untrusted_origin(client, make_user):
    make_user("admin", RoleCode.ADMIN)
    login(client, "admin")

    response = client.post(REFRESH, headers={"Origin": "https://evil.example"})

    assert response.status_code == 403
    assert client.post(REFRESH, headers={"Origin": "http://localhost:5173"}).status_code == 200


def test_expired_refresh_token_is_rejected(client, make_user, db):
    make_user("admin", RoleCode.ADMIN)
    login(client, "admin")
    db.query(RefreshToken).update({RefreshToken.expires_at: utcnow() - timedelta(seconds=1)})
    db.commit()

    assert client.post(REFRESH).status_code == 401


def test_logout_revokes_refresh_token(client, make_user, db):
    make_user("admin", RoleCode.ADMIN)
    login(client, "admin")
    cookie = client.cookies["refresh_token"]

    response = client.post(LOGOUT)
    assert response.status_code == 204
    assert "refresh_token" not in client.cookies  # cookie đã bị xóa ở trình duyệt

    assert replay_refresh_token(client, cookie).status_code == 401
    assert reuse_detections(db) == 1


# --- Hồ sơ & đổi mật khẩu ---


def test_update_profile(client, make_user):
    make_user("admin", RoleCode.ADMIN)
    headers = bearer(login(client, "admin"))

    response = client.patch(
        ME, headers=headers, json={"full_name": "Nguyễn Văn A", "email": "a@example.com", "phone": ""}
    )

    assert response.status_code == 200
    assert response.json()["full_name"] == "Nguyễn Văn A"
    assert response.json()["email"] == "a@example.com"
    assert response.json()["phone"] is None


def test_profile_cannot_change_role(client, make_user):
    make_user("thungan")
    headers = bearer(login(client, "thungan"))

    response = client.patch(ME, headers=headers, json={"role_id": 1})

    assert response.status_code == 422


def test_change_password_requires_current_password(client, make_user):
    make_user("admin", RoleCode.ADMIN)
    headers = bearer(login(client, "admin"))

    response = client.post(
        CHANGE_PASSWORD, headers=headers, json={"current_password": "Sai12345", "new_password": "MoiMoi123"}
    )

    assert response.status_code == 422
    assert response.json()["error"]["details"][0]["field"] == "current_password"


def test_change_password_rejects_weak_password(client, make_user):
    make_user("admin", RoleCode.ADMIN)
    headers = bearer(login(client, "admin"))

    response = client.post(
        CHANGE_PASSWORD,
        headers=headers,
        json={"current_password": DEFAULT_PASSWORD, "new_password": "abcdefgh"},
    )

    assert response.status_code == 422
    assert response.json()["error"]["details"][0]["field"] == "new_password"


def test_change_password_revokes_other_sessions(client, make_user, db):
    make_user("admin", RoleCode.ADMIN)
    login(client, "admin")
    other_device_cookie = client.cookies["refresh_token"]
    headers = bearer(login(client, "admin"))

    response = client.post(
        CHANGE_PASSWORD,
        headers=headers,
        json={"current_password": DEFAULT_PASSWORD, "new_password": "MoiMoi123"},
    )
    assert response.status_code == 200

    assert login(client, "admin").status_code == 401
    assert login(client, "admin", "MoiMoi123").status_code == 200

    assert replay_refresh_token(client, other_device_cookie).status_code == 401
    assert reuse_detections(db) == 1
