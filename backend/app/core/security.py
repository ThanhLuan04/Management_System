import hashlib
import secrets
from datetime import timedelta

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

from app.core.config import get_settings
from app.core.errors import AppError
from app.utils.time import utcnow

_hasher = PasswordHasher()  # Argon2id với tham số mặc định khuyến nghị của argon2-cffi

# Hash giả để vẫn tốn thời gian verify khi username không tồn tại,
# tránh kẻ tấn công đoán được tài khoản nào có thật dựa vào thời gian phản hồi
DUMMY_PASSWORD_HASH = _hasher.hash("smartstore-dummy-password")


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except (VerificationError, InvalidHashError):
        return False


def password_needs_rehash(password_hash: str) -> bool:
    return _hasher.check_needs_rehash(password_hash)


def create_access_token(user_id: int) -> tuple[str, int]:
    """Trả về (token, số giây hiệu lực). Quyền không nằm trong token mà đọc từ DB mỗi request."""
    settings = get_settings()
    expires_in = settings.access_token_expire_minutes * 60
    now = utcnow()
    payload = {
        "sub": str(user_id),
        "type": "access",
        "iat": now,
        "exp": now + timedelta(seconds=expires_in),
    }
    token = jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)
    return token, expires_in


def decode_access_token(token: str) -> int:
    """Trả về user_id nếu token hợp lệ, ngược lại ném AppError 401."""
    settings = get_settings()
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret_key,
            algorithms=[settings.jwt_algorithm],
            options={"require": ["sub", "exp", "type"]},
        )
    except jwt.ExpiredSignatureError as exc:
        raise AppError("TOKEN_EXPIRED", "Phiên đăng nhập đã hết hạn", 401, headers=_bearer_header()) from exc
    except jwt.InvalidTokenError as exc:
        raise AppError("UNAUTHORIZED", "Token không hợp lệ", 401, headers=_bearer_header()) from exc

    if payload.get("type") != "access" or not str(payload["sub"]).isdigit():
        raise AppError("UNAUTHORIZED", "Token không hợp lệ", 401, headers=_bearer_header())
    return int(payload["sub"])


def new_refresh_token() -> tuple[str, str]:
    """Trả về (token gốc để đặt vào cookie, SHA-256 để lưu DB)."""
    raw = secrets.token_urlsafe(32)
    return raw, hash_refresh_token(raw)


def hash_refresh_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def _bearer_header() -> dict[str, str]:
    return {"WWW-Authenticate": "Bearer"}
