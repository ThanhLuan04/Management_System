from datetime import datetime
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import (
    AfterValidator,
    BaseModel,
    BeforeValidator,
    ConfigDict,
    Field,
    StringConstraints,
    field_validator,
    model_validator,
)

from app.schemas.common import StrictModel, empty_to_none
from app.schemas.user import UserRef

_COST_NOTE = "Chỉ có khi người dùng có quyền cost.view"


def _whole_dong(value: Decimal) -> Decimal:
    if value != value.to_integral_value():
        raise ValueError("Số tiền phải là số đồng nguyên")
    return value


WholeDong = Annotated[Decimal, Field(ge=0, le=Decimal("999999999999")), AfterValidator(_whole_dong)]


class OrderItemIn(StrictModel):
    """Chỉ gửi sản phẩm và số lượng. Giá bán luôn lấy từ database."""

    product_id: int
    quantity: Annotated[int, Field(ge=1, le=10_000)]


class DiscountIn(StrictModel):
    type: Literal["AMOUNT", "PERCENT"]
    value: Annotated[Decimal, Field(ge=0, le=Decimal("999999999999"), decimal_places=2)]

    @model_validator(mode="after")
    def check_value(self) -> "DiscountIn":
        if self.type == "PERCENT" and self.value > 100:
            raise ValueError("Phần trăm giảm giá tối đa 100")
        if self.type == "AMOUNT":
            _whole_dong(self.value)
        return self


class PaymentIn(StrictModel):
    method: Literal["CASH", "BANK_TRANSFER", "CARD"]
    cash_received: WholeDong | None = Field(None, description="Bắt buộc khi thanh toán tiền mặt")
    reference_note: Annotated[
        Annotated[str, StringConstraints(max_length=100)] | None, BeforeValidator(empty_to_none)
    ] = Field(None, description="Mã giao dịch chuyển khoản / thẻ (nhập tay)")

    @model_validator(mode="after")
    def cash_fields(self) -> "PaymentIn":
        if self.method == "CASH" and self.cash_received is None:
            raise ValueError("Thanh toán tiền mặt cần nhập số tiền khách đưa (cash_received)")
        if self.method != "CASH" and self.cash_received is not None:
            raise ValueError("Chỉ nhập cash_received khi thanh toán tiền mặt")
        return self


class OrderCreate(StrictModel):
    """Không có trường giá / tổng tiền nào: backend tự tính lại toàn bộ (gửi lên sẽ bị từ chối)."""

    customer_id: int | None = Field(None, description="Bỏ trống = khách lẻ")
    items: Annotated[list[OrderItemIn], Field(min_length=1, max_length=100)]
    discount: DiscountIn | None = None
    payment: PaymentIn
    note: Annotated[
        Annotated[str, StringConstraints(max_length=500)] | None, BeforeValidator(empty_to_none)
    ] = None

    @field_validator("items")
    @classmethod
    def unique_products(cls, items: list[OrderItemIn]) -> list[OrderItemIn]:
        if len({item.product_id for item in items}) != len(items):
            raise ValueError("Mỗi sản phẩm chỉ xuất hiện một dòng trong đơn (hãy tăng số lượng)")
        return items


class CustomerRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    code: str
    name: str
    phone: str | None


class OrderItemOut(BaseModel):
    id: int
    product_id: int
    sku: str
    product_name: str
    unit: str
    quantity: int
    unit_price: Decimal
    line_subtotal: Decimal
    discount_allocated: Decimal
    line_total: Decimal
    returned_quantity: int = Field(description="Tổng số đã trả qua các phiếu trả")
    returnable_quantity: int = Field(description="Số còn được trả (0 nếu đơn đã hủy)")
    unit_cost: Decimal | None = Field(None, description=_COST_NOTE)


class ReturnRef(BaseModel):
    id: int
    code: str
    total_refund: Decimal
    created_at: datetime


class PaymentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    type: str
    method: str
    amount: Decimal
    cash_received: Decimal | None
    change_amount: Decimal | None
    reference_note: str | None
    created_at: datetime


class OrderSummaryOut(BaseModel):
    id: int
    code: str
    status: str
    return_status: Literal["NONE", "PARTIAL", "FULL"] = Field(
        description="Tính từ các phiếu trả, không lưu trong DB"
    )
    customer: CustomerRef | None
    subtotal: Decimal
    discount_amount: Decimal
    total_amount: Decimal
    item_count: int
    payment_method: str | None
    created_by: UserRef
    created_at: datetime


class OrderOut(OrderSummaryOut):
    discount_type: str | None
    discount_value: Decimal
    note: str | None
    items: list[OrderItemOut]
    payments: list[PaymentOut]
    returns: list[ReturnRef]
    cancelled_by: UserRef | None
    cancelled_at: datetime | None
    cancel_reason: str | None
    gross_profit: Decimal | None = Field(
        None, description=f"(Doanh thu − tiền hoàn) − (giá vốn − giá vốn hàng trả nhập lại kho). {_COST_NOTE}"
    )


Reason = Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=255)]


class CancelRequest(StrictModel):
    reason: Reason


# ---------- Trả hàng ----------


class ReturnItemIn(StrictModel):
    order_item_id: int
    quantity: Annotated[int, Field(ge=1, le=10_000)]
    condition: Literal["RESELLABLE", "DAMAGED"] = Field(
        description="RESELLABLE: còn bán được (nhập lại kho) · DAMAGED: hỏng (không nhập lại kho)"
    )


class ReturnCreate(StrictModel):
    """Tiền hoàn do backend tính theo giá sau giảm của từng dòng đơn gốc."""

    reason: Reason
    items: Annotated[list[ReturnItemIn], Field(min_length=1, max_length=100)]

    @field_validator("items")
    @classmethod
    def unique_items(cls, items: list[ReturnItemIn]) -> list[ReturnItemIn]:
        if len({item.order_item_id for item in items}) != len(items):
            raise ValueError("Mỗi dòng hàng chỉ xuất hiện một lần trong phiếu trả")
        return items


class OrderRef(BaseModel):
    id: int
    code: str


class ReturnItemOut(BaseModel):
    id: int
    order_item_id: int
    product_id: int
    sku: str
    product_name: str
    quantity: int
    condition: str
    refund_amount: Decimal
    unit_cost: Decimal | None = Field(None, description=_COST_NOTE)


class ReturnSummaryOut(BaseModel):
    id: int
    code: str
    order: OrderRef
    customer: CustomerRef | None
    reason: str
    total_refund: Decimal
    refund_method: str | None
    item_count: int
    created_by: UserRef
    created_at: datetime


class ReturnOut(ReturnSummaryOut):
    items: list[ReturnItemOut]
