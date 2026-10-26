from decimal import Decimal
from typing import Any

from sqlalchemy.orm import Session

from app.core.permissions import RoleCode
from app.models import Setting, User
from app.schemas.report import SettingsOut
from app.services import audit_service

# Giá trị dự phòng nếu bảng settings thiếu key (migration 0001 đã seed sẵn các key này)
DEFAULTS: dict[str, Any] = {
    "store_name": "SmartStore",
    "store_address": "",
    "store_phone": "",
    "max_discount_percent_cashier": 10,
    "max_discount_percent_manager": 30,
    "return_window_days": 7,
}


def get_value(db: Session, key: str) -> Any:
    row = db.get(Setting, key)
    return row.value if row is not None else DEFAULTS.get(key)


def settings_out(db: Session, role_code: str, can_manage: bool) -> SettingsOut:
    data = {
        key: get_value(db, key)
        for key in ("store_name", "store_address", "store_phone", "return_window_days")
    }
    if can_manage or role_code == RoleCode.MANAGER:
        data["max_discount_percent_cashier"] = Decimal(str(get_value(db, "max_discount_percent_cashier")))
        data["max_discount_percent_manager"] = Decimal(str(get_value(db, "max_discount_percent_manager")))
    data["my_max_discount_percent"] = max_discount_percent(db, role_code)
    return SettingsOut.model_validate(data)


def update_settings(db: Session, changes: dict[str, Any], actor: User, ip: str | None) -> None:
    old, new = {}, {}
    for key, value in changes.items():
        if value is None:
            continue
        if isinstance(value, Decimal):  # JSONB lưu số JSON: 10 thay vì "10.00"
            value = int(value) if value == value.to_integral_value() else float(value)
        row = db.get(Setting, key)
        if row is None:
            row = Setting(key=key, value=value)
            db.add(row)
            old[key] = None
        elif row.value == value:
            continue
        else:
            old[key] = row.value
            row.value = value
        row.updated_by = actor.id
        new[key] = value
    if new:
        audit_service.record(
            db,
            action="SETTINGS_UPDATE",
            user_id=actor.id,
            entity_type="settings",
            old_values=old,
            new_values=new,
            ip_address=ip,
        )
    db.commit()


def max_discount_percent(db: Session, role_code: str) -> Decimal | None:
    """Giới hạn % giảm giá trên một đơn theo vai trò. None = không giới hạn (Admin)."""
    if role_code == RoleCode.ADMIN:
        return None
    key = "max_discount_percent_manager" if role_code == RoleCode.MANAGER else "max_discount_percent_cashier"
    return Decimal(str(get_value(db, key)))
