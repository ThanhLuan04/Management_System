from datetime import datetime
from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, BeforeValidator, Field, StringConstraints

from app.schemas.common import StrictModel, empty_to_none
from app.schemas.report import MethodAmount
from app.schemas.sales import WholeDong
from app.schemas.user import UserRef

__all__ = [
    "CashierSales",
    "MethodAmount",
    "ShiftClose",
    "ShiftCurrentOut",
    "ShiftOpen",
    "ShiftOut",
    "ShiftSummaryOut",
]


class ShiftOpen(StrictModel):
    opening_cash: Annotated[WholeDong, Field(ge=0, description="Tiền mặt có sẵn trong két lúc mở ca")]


class ShiftClose(StrictModel):
    counted_cash: Annotated[WholeDong, Field(ge=0, description="Tiền mặt đếm thực tế trong két lúc đóng ca")]
    note: Annotated[
        Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)] | None,
        BeforeValidator(empty_to_none),
    ] = Field(None, description="Bắt buộc khi tiền đếm được lệch so với tiền mặt phải có")


class ShiftSummaryOut(BaseModel):
    id: int
    code: str
    status: str
    opening_cash: Decimal
    opened_by: UserRef
    opened_at: datetime
    counted_cash: Decimal | None
    expected_cash: Decimal | None = Field(description="Chốt lúc đóng ca; ca đang mở = null")
    difference: Decimal | None = Field(description="counted_cash − expected_cash (âm = thiếu tiền)")
    close_note: str | None
    closed_by: UserRef | None
    closed_at: datetime | None


class CashierSales(BaseModel):
    user: UserRef
    order_count: int
    revenue: Decimal


class ShiftOut(ShiftSummaryOut):
    current_expected_cash: Decimal = Field(description="Tiền mặt phải có: tính trực tiếp nếu ca đang mở")
    cash_received: Decimal
    cash_refunded: Decimal
    received_by_method: list[MethodAmount]
    refunded_by_method: list[MethodAmount]
    order_count: int
    by_cashier: list[CashierSales] = Field(description="Doanh số từng thu ngân trong ca (két chung)")


class ShiftCurrentOut(BaseModel):
    shift: ShiftOut | None = Field(description="null = chưa mở ca")
    suggested_opening_cash: Decimal = Field(description="Gợi ý tiền đầu ca = tiền đếm lúc đóng ca trước")
