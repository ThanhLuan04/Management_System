from datetime import timedelta

import jwt
import pytest

from app.core.config import get_settings
from app.core.errors import AppError
from app.core.security import (
    create_access_token,
    decode_access_token,
    hash_password,
    hash_refresh_token,
    new_refresh_token,
    verify_password,
)
from app.utils.time import utcnow


def test_password_hash_is_argon2_and_verifies():
    hashed = hash_password("Secret123")

    assert hashed.startswith("$argon2id$")
    assert "Secret123" not in hashed
    assert verify_password(hashed, "Secret123")
    assert not verify_password(hashed, "secret123")


def test_same_password_gets_different_hashes():
    # Có salt ngẫu nhiên → hai user cùng mật khẩu vẫn có hash khác nhau
    assert hash_password("Secret123") != hash_password("Secret123")


def test_verify_password_rejects_malformed_hash():
    assert not verify_password("not-a-hash", "Secret123")


def test_access_token_roundtrip():
    token, expires_in = create_access_token(42)

    assert expires_in == get_settings().access_token_expire_minutes * 60
    assert decode_access_token(token) == 42


def _encode(payload: dict, key: str | None = None) -> str:
    settings = get_settings()
    return jwt.encode(payload, key or settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def test_expired_token_is_rejected_with_token_expired():
    token = _encode({"sub": "1", "type": "access", "exp": utcnow() - timedelta(seconds=1)})

    with pytest.raises(AppError) as exc:
        decode_access_token(token)
    assert exc.value.code == "TOKEN_EXPIRED"
    assert exc.value.status_code == 401


@pytest.mark.parametrize(
    "token",
    [
        "garbage",
        # Ký bằng khóa khác (token giả mạo)
        _encode({"sub": "1", "type": "access", "exp": utcnow() + timedelta(minutes=5)}, key="x" * 64),
        # Sai loại token
        _encode({"sub": "1", "type": "refresh", "exp": utcnow() + timedelta(minutes=5)}),
        # Thiếu exp
        _encode({"sub": "1", "type": "access"}),
    ],
)
def test_invalid_tokens_are_rejected(token):
    with pytest.raises(AppError) as exc:
        decode_access_token(token)
    assert exc.value.code == "UNAUTHORIZED"


def test_refresh_token_only_hash_is_stored():
    raw, stored = new_refresh_token()

    assert len(raw) >= 40
    assert stored == hash_refresh_token(raw)
    assert raw not in stored
