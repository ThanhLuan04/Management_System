from decimal import Decimal
from typing import Any

from sqlalchemy.orm import Session

from app.core.permissions import RoleCode
from app.models import Setting

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


def max_discount_percent(db: Session, role_code: str) -> Decimal | None:
    """Giới hạn % giảm giá trên một đơn theo vai trò. None = không giới hạn (Admin)."""
    if role_code == RoleCode.ADMIN:
        return None
    key = "max_discount_percent_manager" if role_code == RoleCode.MANAGER else "max_discount_percent_cashier"
    return Decimal(str(get_value(db, key)))
