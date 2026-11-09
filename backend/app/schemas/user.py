from datetime import datetime
from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, BeforeValidator, ConfigDict, EmailStr, Field, StringConstraints

from app.schemas.common import Password, Phone, StrictModel, empty_to_none

Username = Annotated[str, StringConstraints(strip_whitespace=True, pattern=r"^[A-Za-z0-9._-]{3,50}$")]
FullName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
OptionalEmail = Annotated[EmailStr | None, BeforeValidator(empty_to_none)]
# Lương/giờ (đồng, số nguyên); null = chưa đặt
HourlyRate = Annotated[Decimal, Field(ge=0, le=Decimal("100000000"), decimal_places=0)] | None


class RoleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    code: str
    name: str


class UserRef(BaseModel):
    """Thông tin rút gọn của người thao tác, dùng trong chứng từ (người tạo, người xác nhận...)."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    full_name: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    full_name: str
    email: str | None
    phone: str | None
    role: RoleOut
    is_active: bool
    hourly_rate: Decimal | None = Field(description="Lương/giờ dùng cho chấm công")
    last_login_at: datetime | None
    created_at: datetime
    updated_at: datetime


class UserCreate(StrictModel):
    username: Username
    password: Password
    full_name: FullName
    email: OptionalEmail = None
    phone: Phone = None
    role_id: int
    hourly_rate: HourlyRate = None


class UserUpdate(StrictModel):
    full_name: FullName | None = None
    email: OptionalEmail = None
    phone: Phone = None
    role_id: int | None = None
    hourly_rate: HourlyRate = None


class UserStatusUpdate(StrictModel):
    is_active: bool


class PasswordReset(StrictModel):
    new_password: Password
