import sys

import pytest
from sqlalchemy import select

from app.core.permissions import RoleCode
from app.models import AuditLog
from scripts import reset_password
from tests.conftest import login


def run_script(monkeypatch, username: str, *passwords: str) -> int:
    answers = iter(passwords)
    monkeypatch.setattr(reset_password.getpass, "getpass", lambda prompt="": next(answers))
    monkeypatch.setattr(sys, "argv", ["reset_password", "--username", username])
    return reset_password.main()


def lock_out(client, username: str) -> None:
    for _ in range(5):
        login(client, username, "Sai12345")
    assert login(client, username).json()["error"]["code"] == "ACCOUNT_LOCKED"


def test_resets_password_and_unlocks_a_locked_admin(client, make_user, db, monkeypatch, capsys):
    make_user("admin", RoleCode.ADMIN)
    lock_out(client, "admin")

    assert run_script(monkeypatch, "ADMIN", "MatKhauMoi9", "MatKhauMoi9") == 0

    assert "mở khóa tài khoản 'admin'" in capsys.readouterr().out
    assert login(client, "admin", "MatKhauMoi9").status_code == 200
    assert login(client, "admin").json()["error"]["code"] == "INVALID_CREDENTIALS"  # mật khẩu cũ hết hiệu lực
    audit = db.scalar(select(AuditLog).where(AuditLog.action == "USER_RESET_PASSWORD"))
    assert (
        audit is not None and audit.user_id is None
    )  # chạy từ dòng lệnh, không có người thực hiện trong hệ thống


@pytest.mark.parametrize(
    ("passwords", "message"),
    [
        (("MatKhauMoi9", "KhacNhau9"), "không khớp"),
        (("ngan1", "ngan1"), ""),  # vi phạm quy tắc mật khẩu → báo lỗi, không đổi
    ],
)
def test_rejects_mismatched_or_weak_password(client, make_user, monkeypatch, capsys, passwords, message):
    make_user("admin", RoleCode.ADMIN)

    assert run_script(monkeypatch, "admin", *passwords) == 1

    assert message in capsys.readouterr().err
    assert login(client, "admin").status_code == 200  # mật khẩu cũ vẫn dùng được


def test_unknown_username(monkeypatch, capsys):
    assert run_script(monkeypatch, "khongtontai") == 1
    assert "Không có tài khoản" in capsys.readouterr().err
