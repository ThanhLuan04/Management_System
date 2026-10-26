from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy.orm import Session

from app.models import AuditLog

# Không bao giờ ghi các trường này vào audit log
_SENSITIVE_KEYS = {"password", "password_hash", "new_password", "current_password", "token", "token_hash"}


def _json_safe(value: Any) -> Any:
    # JSONB không nhận Decimal/datetime; tiền giữ dạng chuỗi để không mất độ chính xác
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, datetime | date):
        return value.isoformat()
    return value


def _scrub(values: dict[str, Any] | None) -> dict[str, Any] | None:
    if values is None:
        return None
    return {k: _json_safe(v) for k, v in values.items() if k not in _SENSITIVE_KEYS}


def record(
    db: Session,
    *,
    action: str,
    user_id: int | None,
    entity_type: str | None = None,
    entity_id: int | None = None,
    old_values: dict[str, Any] | None = None,
    new_values: dict[str, Any] | None = None,
    ip_address: str | None = None,
) -> None:
    """Thêm một dòng audit vào session hiện tại — được commit cùng transaction của nghiệp vụ."""
    db.add(
        AuditLog(
            action=action,
            user_id=user_id,
            entity_type=entity_type,
            entity_id=entity_id,
            old_values=_scrub(old_values),
            new_values=_scrub(new_values),
            ip_address=ip_address,
        )
    )
