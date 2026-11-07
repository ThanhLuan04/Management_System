"""
Quên mật khẩu qua email: gửi mã 6 số → nhập mã + mật khẩu mới.

Nguyên tắc an toàn:
- Không tiết lộ email có tồn tại hay không: bước yêu cầu mã luôn trả cùng một câu trả lời; email gửi sau khi
  đã trả response (BackgroundTasks) nên thời gian phản hồi cũng như nhau.
- Mã chỉ lưu HMAC, hết hạn sau PASSWORD_RESET_CODE_MINUTES, dùng một lần, tối đa PASSWORD_RESET_MAX_ATTEMPTS
  lần nhập sai; yêu cầu mã mới làm mã cũ hết hiệu lực.
- Đặt lại thành công: mở khóa tài khoản (kể cả đang bị khóa do nhập sai), đăng xuất mọi thiết bị, ghi nhật ký.
"""

import hmac
from dataclasses import dataclass
from datetime import timedelta

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import AppError
from app.core.security import hash_password, hash_reset_code, new_reset_code
from app.models import PasswordResetCode, User
from app.services import audit_service, settings_service
from app.services.auth_service import revoke_all_sessions
from app.utils.time import utcnow


@dataclass(frozen=True)
class ResetEmail:
    """Thông tin để gửi email sau khi đã trả response."""

    to: str
    full_name: str
    store_name: str
    code: str
    minutes: int


def _invalid_code() -> AppError:
    return AppError(
        "INVALID_RESET_CODE",
        "Mã xác nhận không đúng hoặc đã hết hạn. Hãy kiểm tra lại hoặc yêu cầu mã mới.",
        400,
    )


def _active_user_by_email(db: Session, email: str) -> User | None:
    return db.scalar(
        select(User).where(func.lower(User.email) == email.strip().lower(), User.is_active.is_(True))
    )


def request_code(db: Session, email: str, ip: str | None) -> ResetEmail | None:
    """Tạo mã mới nếu email thuộc một tài khoản đang hoạt động. Trả None nếu không gửi (người gọi KHÔNG được báo khác đi)."""
    settings = get_settings()
    user = _active_user_by_email(db, email)
    if user is None:
        return None

    now = utcnow()
    latest = db.scalar(
        select(PasswordResetCode.created_at)
        .where(PasswordResetCode.user_id == user.id)
        .order_by(PasswordResetCode.created_at.desc())
        .limit(1)
    )
    if latest and now - latest < timedelta(seconds=settings.password_reset_cooldown_seconds):
        return None  # vừa gửi xong — chống spam hộp thư của người dùng

    # Mã cũ chưa dùng hết hiệu lực: luôn chỉ có một mã hợp lệ
    db.execute(
        update(PasswordResetCode)
        .where(PasswordResetCode.user_id == user.id, PasswordResetCode.used_at.is_(None))
        .values(used_at=now)
    )
    code = new_reset_code()
    db.add(
        PasswordResetCode(
            user_id=user.id,
            code_hash=hash_reset_code(user.id, code),
            expires_at=now + timedelta(minutes=settings.password_reset_code_minutes),
        )
    )
    audit_service.record(
        db,
        action="PASSWORD_RESET_REQUESTED",
        user_id=user.id,
        entity_type="user",
        entity_id=user.id,
        ip_address=ip,
    )
    db.commit()
    return ResetEmail(
        to=user.email,
        full_name=user.full_name,
        store_name=settings_service.get_value(db, "store_name"),
        code=code,
        minutes=settings.password_reset_code_minutes,
    )


def reset_with_code(db: Session, email: str, code: str, new_password: str, ip: str | None) -> None:
    settings = get_settings()
    user = _active_user_by_email(db, email)
    if user is None:
        raise _invalid_code()

    now = utcnow()
    # Khóa dòng mã: hai request đồng thời không thể cùng dùng một mã hay vượt giới hạn nhập sai
    row = db.scalar(
        select(PasswordResetCode)
        .where(
            PasswordResetCode.user_id == user.id,
            PasswordResetCode.used_at.is_(None),
            PasswordResetCode.expires_at > now,
        )
        .order_by(PasswordResetCode.created_at.desc())
        .limit(1)
        .with_for_update()
    )
    if row is None or row.failed_attempts >= settings.password_reset_max_attempts:
        db.rollback()
        raise _invalid_code()

    if not hmac.compare_digest(row.code_hash, hash_reset_code(user.id, code)):
        row.failed_attempts += 1
        if row.failed_attempts >= settings.password_reset_max_attempts:
            row.used_at = now  # hết lượt → mã bỏ đi, phải yêu cầu mã mới
        db.commit()
        raise _invalid_code()

    row.used_at = now
    user.password_hash = hash_password(new_password)
    user.failed_login_count = 0
    user.locked_until = None
    revoke_all_sessions(db, user.id)
    audit_service.record(
        db,
        action="PASSWORD_RESET_BY_EMAIL",
        user_id=user.id,
        entity_type="user",
        entity_id=user.id,
        ip_address=ip,
    )
    db.commit()
