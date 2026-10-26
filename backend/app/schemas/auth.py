from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, StringConstraints

from app.schemas.common import Password, Phone, StrictModel
from app.schemas.user import FullName, OptionalEmail, RoleOut


class LoginRequest(StrictModel):
    username: Annotated[str, StringConstraints(min_length=3, max_length=50)]
    # Không strip/validate độ mạnh khi đăng nhập: so khớp đúng chuỗi người dùng gõ
    password: Annotated[str, StringConstraints(min_length=1, max_length=128, strip_whitespace=False)]


class MeResponse(BaseModel):
    id: int
    username: str
    full_name: str
    email: str | None
    phone: str | None
    role: RoleOut
    permissions: list[str]
    last_login_at: datetime | None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: MeResponse


class ProfileUpdate(StrictModel):
    full_name: FullName | None = None
    email: OptionalEmail = None
    phone: Phone = None


class ChangePasswordRequest(StrictModel):
    current_password: Annotated[str, StringConstraints(min_length=1, max_length=128, strip_whitespace=False)]
    new_password: Password
