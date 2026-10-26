from dataclasses import dataclass
from datetime import timedelta

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import AppError
from app.core.permissions import permissions_for
from app.core.security import (
    DUMMY_PASSWORD_HASH,
    create_access_token,
    hash_password,
    hash_refresh_token,
    new_refresh_token,
    password_needs_rehash,
    verify_password,
)
from app.models import RefreshToken, User
from app.schemas.auth import MeResponse
from app.schemas.user import RoleOut
from app.services import audit_service
from app.utils.time import utcnow


@dataclass
class AuthSession:
    """Kết quả đăng nhập/làm mới: access token cho header, refresh token gốc cho cookie."""

    user: User
    access_token: str
    expires_in: int
    refresh_token: str


def to_me(user: User) -> MeResponse:
    return MeResponse(
        id=user.id,
        username=user.username,
        full_name=user.full_name,
        email=user.email,
        phone=user.phone,
        role=RoleOut.model_validate(user.role),
        permissions=sorted(permissions_for(user.role.code)),
        last_login_at=user.last_login_at,
    )


def _invalid_credentials() -> AppError:
    # Cùng một thông báo cho sai username lẫn sai mật khẩu
    return AppError("INVALID_CREDENTIALS", "Tên đăng nhập hoặc mật khẩu không đúng", 401)


def _issue_session(db: Session, user: User, user_agent: str | None) -> AuthSession:
    settings = get_settings()
    raw, token_hash = new_refresh_token()
    db.add(
        RefreshToken(
            user_id=user.id,
            token_hash=token_hash,
            expires_at=utcnow() + timedelta(days=settings.refresh_token_expire_days),
            user_agent=(user_agent or "")[:255] or None,
        )
    )
    access_token, expires_in = create_access_token(user.id)
    return AuthSession(user=user, access_token=access_token, expires_in=expires_in, refresh_token=raw)


def revoke_all_sessions(db: Session, user_id: int) -> None:
    db.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=utcnow())
    )


def login(db: Session, username: str, password: str, ip: str | None, user_agent: str | None) -> AuthSession:
    settings = get_settings()
    now = utcnow()

    # FOR UPDATE: hai lần đăng nhập sai đồng thời không làm mất một lần đếm
    user = db.scalar(
        select(User).where(func.lower(User.username) == username.lower()).with_for_update(of=User)
    )

    if user is None:
        verify_password(DUMMY_PASSWORD_HASH, password)
        audit_service.record(
            db, action="LOGIN_FAILED", user_id=None, new_values={"username": username}, ip_address=ip
        )
        db.commit()
        raise _invalid_credentials()

    if user.locked_until and user.locked_until > now:
        db.rollback()
        raise AppError(
            "ACCOUNT_LOCKED",
            "Tài khoản tạm thời bị khóa do đăng nhập sai nhiều lần",
            403,
            {"locked_until": user.locked_until.isoformat()},
        )

    if not verify_password(user.password_hash, password):
        user.failed_login_count += 1
        locked = user.failed_login_count >= settings.login_max_failed_attempts
        if locked:
            user.locked_until = now + timedelta(minutes=settings.login_lock_minutes)
            user.failed_login_count = 0
        audit_service.record(
            db,
            action="LOGIN_LOCKED" if locked else "LOGIN_FAILED",
            user_id=user.id,
            entity_type="user",
            entity_id=user.id,
            ip_address=ip,
        )
        db.commit()
        if locked:
            raise AppError(
                "ACCOUNT_LOCKED",
                f"Đăng nhập sai quá {settings.login_max_failed_attempts} lần. "
                f"Tài khoản bị khóa {settings.login_lock_minutes} phút",
                403,
                {"locked_until": user.locked_until.isoformat()},
            )
        raise _invalid_credentials()

    # Kiểm tra trạng thái SAU khi mật khẩu đúng, để người không biết mật khẩu không dò được trạng thái tài khoản
    if not user.is_active:
        db.rollback()
        raise AppError("ACCOUNT_DISABLED", "Tài khoản đã bị vô hiệu hóa", 403)

    user.failed_login_count = 0
    user.locked_until = None
    user.last_login_at = now
    if password_needs_rehash(user.password_hash):
        user.password_hash = hash_password(password)

    session = _issue_session(db, user, user_agent)
    audit_service.record(
        db, action="LOGIN_SUCCESS", user_id=user.id, entity_type="user", entity_id=user.id, ip_address=ip
    )
    db.commit()
    return session


def refresh(db: Session, raw_token: str | None, user_agent: str | None) -> AuthSession:
    """Đổi refresh token lấy cặp token mới (rotation). Token cũ bị thu hồi ngay."""
    expired = AppError("UNAUTHORIZED", "Phiên đăng nhập không hợp lệ hoặc đã hết hạn", 401)
    if not raw_token:
        raise expired

    token = db.scalar(
        select(RefreshToken).where(RefreshToken.token_hash == hash_refresh_token(raw_token)).with_for_update()
    )
    if token is None:
        raise expired

    now = utcnow()
    if token.revoked_at is not None:
        # Token đã dùng rồi mà vẫn bị gửi lại → có thể đã bị đánh cắp: thu hồi mọi phiên của user
        revoke_all_sessions(db, token.user_id)
        audit_service.record(
            db,
            action="REFRESH_TOKEN_REUSE",
            user_id=token.user_id,
            entity_type="user",
            entity_id=token.user_id,
        )
        db.commit()
        raise expired

    user = db.get(User, token.user_id)
    if token.expires_at <= now or user is None or not user.is_active:
        raise expired

    token.revoked_at = now
    session = _issue_session(db, user, user_agent)
    db.commit()
    return session


def logout(db: Session, raw_token: str | None) -> None:
    if not raw_token:
        return
    db.execute(
        update(RefreshToken)
        .where(RefreshToken.token_hash == hash_refresh_token(raw_token), RefreshToken.revoked_at.is_(None))
        .values(revoked_at=utcnow())
    )
    db.commit()


def update_profile(db: Session, user: User, changes: dict) -> User:
    if changes.get("full_name") is None:
        changes.pop("full_name", None)
    if "email" in changes:
        ensure_email_available(db, changes["email"], exclude_user_id=user.id)

    old = {key: getattr(user, key) for key in changes}
    for key, value in changes.items():
        setattr(user, key, value)
    audit_service.record(
        db,
        action="PROFILE_UPDATE",
        user_id=user.id,
        entity_type="user",
        entity_id=user.id,
        old_values=old,
        new_values=changes,
    )
    db.commit()
    return user


def change_password(
    db: Session, user: User, current_password: str, new_password: str, user_agent: str | None
) -> AuthSession:
    if not verify_password(user.password_hash, current_password):
        raise AppError(
            "VALIDATION_ERROR",
            "Dữ liệu không hợp lệ",
            422,
            [{"field": "current_password", "message": "Mật khẩu hiện tại không đúng"}],
        )
    if current_password == new_password:
        raise AppError(
            "VALIDATION_ERROR",
            "Dữ liệu không hợp lệ",
            422,
            [{"field": "new_password", "message": "Mật khẩu mới phải khác mật khẩu hiện tại"}],
        )

    user.password_hash = hash_password(new_password)
    # Đăng xuất mọi phiên khác; phiên hiện tại nhận token mới ngay bên dưới
    revoke_all_sessions(db, user.id)
    session = _issue_session(db, user, user_agent)
    audit_service.record(db, action="PASSWORD_CHANGE", user_id=user.id, entity_type="user", entity_id=user.id)
    db.commit()
    return session


def ensure_email_available(db: Session, email: str | None, exclude_user_id: int | None = None) -> None:
    if email is None:
        return
    stmt = select(User.id).where(func.lower(User.email) == email.lower())
    if exclude_user_id is not None:
        stmt = stmt.where(User.id != exclude_user_id)
    if db.scalar(stmt) is not None:
        raise AppError("DUPLICATE_EMAIL", "Email đã được sử dụng", 409)
