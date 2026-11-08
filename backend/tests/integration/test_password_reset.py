import hashlib
import logging
from datetime import timedelta

import pytest
from sqlalchemy import select

from app.core.config import get_settings
from app.core.permissions import RoleCode
from app.models import AuditLog, PasswordResetCode
from app.services import mailer
from app.utils.time import utcnow
from tests.conftest import login

FORGOT = "/api/v1/auth/forgot-password"
RESET = "/api/v1/auth/reset-password"
NEW_PASSWORD = "MatKhau@Moi9"


@pytest.fixture
def sent(monkeypatch):
    """Thay việc gửi email bằng danh sách ghi lại (to, code)."""
    outbox: list[dict] = []

    def fake_send(to, full_name, store_name, code, minutes):
        outbox.append({"to": to, "code": code, "full_name": full_name, "minutes": minutes})
        return True

    monkeypatch.setattr(mailer, "send_password_reset_code", fake_send)
    return outbox


@pytest.fixture
def admin(make_user, db):
    user = make_user("admin", RoleCode.ADMIN)
    user.email = "Chu.Cua.Hang@example.com"
    db.commit()
    return user


def request_code(client, email="chu.cua.hang@example.com"):
    return client.post(FORGOT, json={"email": email})


def reset(client, code, email="chu.cua.hang@example.com", password=NEW_PASSWORD):
    return client.post(RESET, json={"email": email, "code": code, "new_password": password})


def test_full_flow_unlocks_account_changes_password_and_logs_out_everywhere(client, admin, db, sent):
    old_session = login(client, "admin")
    assert old_session.status_code == 200
    for _ in range(5):
        login(client, "admin", "Sai12345")
    assert login(client, "admin").json()["error"]["code"] == "ACCOUNT_LOCKED"

    response = request_code(client, "CHU.cua.hang@example.com")  # email không phân biệt hoa thường
    assert response.status_code == 202
    assert len(sent) == 1 and sent[0]["to"] == "Chu.Cua.Hang@example.com"
    code = sent[0]["code"]
    assert len(code) == 6 and code.isdigit()

    assert reset(client, code).status_code == 204

    assert login(client, "admin", NEW_PASSWORD).status_code == 200  # hết bị khóa, mật khẩu mới dùng được
    assert login(client, "admin").json()["error"]["code"] == "INVALID_CREDENTIALS"
    actions = set(db.scalars(select(AuditLog.action)))
    assert {"PASSWORD_RESET_REQUESTED", "PASSWORD_RESET_BY_EMAIL"} <= actions


def test_reset_revokes_existing_sessions(client, admin, sent):
    assert login(client, "admin").status_code == 200  # cookie refresh nằm trong client
    request_code(client)
    reset(client, sent[0]["code"])

    assert client.post("/api/v1/auth/refresh").status_code == 401


@pytest.mark.parametrize("case", ["unknown", "inactive", "no_email"])
def test_same_answer_whether_or_not_the_email_belongs_to_an_account(client, make_user, db, sent, case):
    if case == "inactive":
        user = make_user("nghiviec", is_active=False)
        user.email = "chu.cua.hang@example.com"
        db.commit()
    elif case == "no_email":
        make_user("khongemail")

    response = request_code(client)

    assert response.status_code == 202
    assert "Nếu email thuộc một tài khoản" in response.json()["message"]
    assert sent == []


def test_code_is_single_use(client, admin, sent):
    request_code(client)
    code = sent[0]["code"]
    assert reset(client, code).status_code == 204

    second = reset(client, code, password="MatKhau#Khac8")
    assert second.status_code == 400
    assert second.json()["error"]["code"] == "INVALID_RESET_CODE"


def test_code_is_burned_after_too_many_wrong_attempts(client, admin, sent):
    request_code(client)
    code = sent[0]["code"]
    wrong = "000000" if code != "000000" else "111111"
    for _ in range(get_settings().password_reset_max_attempts):
        assert reset(client, wrong).json()["error"]["code"] == "INVALID_RESET_CODE"

    assert reset(client, code).status_code == 400  # đúng mã nhưng đã hết lượt
    assert login(client, "admin").status_code == 200  # mật khẩu cũ không đổi


def test_expired_code_is_rejected(client, admin, db, sent):
    request_code(client)
    row = db.scalar(select(PasswordResetCode))
    row.expires_at = utcnow() - timedelta(seconds=1)
    db.commit()

    assert reset(client, sent[0]["code"]).status_code == 400


def test_new_request_invalidates_previous_code_and_cooldown_limits_emails(client, admin, db, sent):
    request_code(client)
    assert request_code(client).status_code == 202
    assert len(sent) == 1  # trong thời gian chờ: không gửi thêm, câu trả lời vẫn như cũ

    first = db.scalar(select(PasswordResetCode))
    first.created_at = utcnow() - timedelta(minutes=5)  # giả lập đã qua thời gian chờ
    db.commit()
    request_code(client)
    assert len(sent) == 2

    assert reset(client, sent[0]["code"]).status_code == 400  # mã cũ hết hiệu lực
    assert reset(client, sent[1]["code"]).status_code == 204


def test_code_is_stored_only_as_keyed_hash(client, admin, db, sent):
    request_code(client)
    code = sent[0]["code"]
    stored = db.scalar(select(PasswordResetCode.code_hash))

    assert code not in stored
    assert stored != hashlib.sha256(code.encode()).hexdigest()
    assert stored != hashlib.sha256(f"{admin.id}:{code}".encode()).hexdigest()


def test_weak_password_or_malformed_code_is_rejected_without_using_the_code(client, admin, sent):
    request_code(client)
    code = sent[0]["code"]

    assert reset(client, code, password="ngan").status_code == 422
    assert reset(client, "12ab56").status_code == 422
    assert reset(client, code).status_code == 204  # mã vẫn còn dùng được


def test_forgot_password_is_rate_limited_per_ip(client, sent):
    for _ in range(5):
        assert request_code(client, "ai.do@example.com").status_code == 202
    response = request_code(client, "ai.do@example.com")
    assert response.status_code == 429


def test_dev_mailer_logs_code_but_production_never_does(monkeypatch, caplog):
    settings = get_settings()
    monkeypatch.setattr(settings, "smtp_host", None)

    with caplog.at_level(logging.WARNING, logger="app.services.mailer"):
        assert mailer.send_password_reset_code("a@example.com", "A", "SmartStore", "424242", 15) is False
    assert "424242" in caplog.text  # dev: in mã ra log để thử

    caplog.clear()
    monkeypatch.setattr(settings, "environment", "production")
    with caplog.at_level(logging.WARNING, logger="app.services.mailer"):
        mailer.send_password_reset_code("a@example.com", "A", "SmartStore", "424242", 15)
    assert "424242" not in caplog.text
    assert "Chưa cấu hình SMTP_HOST" in caplog.text
