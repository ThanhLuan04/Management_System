import re
from datetime import datetime
from decimal import Decimal
from typing import Annotated

from pydantic import AfterValidator, BaseModel, BeforeValidator, ConfigDict, Field, StringConstraints

from app.schemas.common import Phone, StrictModel, empty_to_none
from app.schemas.user import OptionalEmail

Name255 = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=255)]


def _optional(max_length: int):
    return Annotated[
        Annotated[str, StringConstraints(max_length=max_length)] | None, BeforeValidator(empty_to_none)
    ]


def normalize_phone(value: str) -> str:
    """'0901 234.567' → '0901234567'; '+84 901 234 567' → '0901234567'."""
    digits = re.sub(r"[^\d+]", "", value)
    if digits.startswith("+84"):
        digits = "0" + digits[3:]
    elif digits.startswith("84") and len(digits) == 11:
        digits = "0" + digits[2:]
    if not re.fullmatch(r"0\d{8,10}", digits):
        raise ValueError("Số điện thoại không hợp lệ")
    return digits


CustomerPhone = Annotated[
    Annotated[str, AfterValidator(normalize_phone)] | None,
    BeforeValidator(empty_to_none),
]


# ---------- Nhà cung cấp ----------


class SupplierOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    code: str
    name: str
    contact_name: str | None
    phone: str | None
    email: str | None
    address: str | None
    tax_code: str | None
    note: str | None
    is_active: bool
    created_at: datetime
    updated_at: datetime


class SupplierCreate(StrictModel):
    name: Name255
    contact_name: _optional(100) = None
    phone: Phone = None
    email: OptionalEmail = None
    address: _optional(500) = None
    tax_code: Annotated[
        Annotated[str, StringConstraints(pattern=r"^[0-9-]{10,14}$")] | None, BeforeValidator(empty_to_none)
    ] = None
    note: _optional(2000) = None


class SupplierUpdate(SupplierCreate):
    name: Name255 | None = None
    is_active: bool | None = None


# ---------- Khách hàng ----------


class CustomerOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    code: str
    name: str
    phone: str | None
    email: str | None
    address: str | None
    note: str | None
    is_active: bool
    order_count: int = Field(0, description="Số đơn hợp lệ (không tính đơn đã hủy)")
    total_spent: Decimal = Field(Decimal("0"), description="Tổng tiền các đơn hợp lệ")
    created_at: datetime
    updated_at: datetime


class CustomerCreate(StrictModel):
    name: Name255
    phone: CustomerPhone = None
    email: OptionalEmail = None
    address: _optional(500) = None
    note: _optional(2000) = None


class CustomerUpdate(CustomerCreate):
    name: Name255 | None = None
    is_active: bool | None = None
