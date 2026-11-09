from datetime import datetime
from decimal import Decimal
from typing import Annotated

from pydantic import AwareDatetime, BaseModel, Field, StringConstraints

from app.schemas.common import StrictModel
from app.schemas.user import UserRef

Reason = Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=255)]


class TimeEntryOut(BaseModel):
    id: int
    user: UserRef
    clock_in_at: datetime
    clock_out_at: datetime | None
    minutes: int = Field(description="Số phút làm (lượt đang mở: tính đến hiện tại)")
    hourly_rate: Decimal = Field(description="Lương/giờ chốt lúc vào ca")
    pay: Decimal | None = Field(description="Tiền công của lượt; null khi chưa ra ca")
    note: str | None = Field(description="Lý do khi quản lý thêm / sửa tay")
    edited_by: UserRef | None
    forgotten: bool = Field(description="Đang mở quá 16 giờ — có thể quên bấm ra ca")


class PeriodTotals(BaseModel):
    entry_count: int
    minutes: int
    pay: Decimal


class AttendanceMe(BaseModel):
    current: TimeEntryOut | None = Field(description="Lượt đang mở (null = chưa vào ca)")
    month: PeriodTotals = Field(description="Tháng này (giờ Việt Nam): lượt đã ra ca")
    recent: list[TimeEntryOut]


class SummaryRow(BaseModel):
    user: UserRef
    hourly_rate: Decimal | None = Field(description="Mức lương/giờ hiện tại của nhân viên")
    entry_count: int
    minutes: int
    pay: Decimal
    open_entries: int
    forgotten: int


class TimeEntryCreate(StrictModel):
    user_id: int
    clock_in_at: AwareDatetime
    clock_out_at: AwareDatetime
    reason: Reason


class TimeEntryUpdate(StrictModel):
    clock_in_at: AwareDatetime
    clock_out_at: AwareDatetime | None = Field(None, description="null = để lượt tiếp tục mở")
    reason: Reason


class StaffOut(BaseModel):
    id: int
    full_name: str
    role: str
