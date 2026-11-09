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
    note: Annotated[
        Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)] | None,
        BeforeValidator(empty_to_none),
    ] = Field(None, description="Ghi chú món cho bếp, vd. 'không hành'")
    option_ids: Annotated[list[int], Field(max_length=20)] = Field(
        default_factory=list, description="Lựa chọn của món (size, topping) — giá do backend tính"
    )

    @field_validator("option_ids")
    @classmethod
    def unique_options(cls, ids: list[int]) -> list[int]:
        if len(set(ids)) != len(ids):
            raise ValueError("Lựa chọn bị lặp")
        return sorted(ids)


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


class SplitPaymentIn(StrictModel):
    """Một khoản trong thanh toán kết hợp: số tiền phải ghi rõ (tổng các khoản = tổng đơn, backend kiểm tra)."""

    method: Literal["CASH", "BANK_TRANSFER", "CARD"]
    amount: Annotated[WholeDong, Field(gt=0)]
    cash_received: WholeDong | None = Field(
        None, description="Chỉ cho tiền mặt; bỏ trống = đưa vừa đủ phần tiền mặt (không thối)"
    )
    reference_note: Annotated[
        Annotated[str, StringConstraints(max_length=100)] | None, BeforeValidator(empty_to_none)
    ] = Field(None, description="Nội dung chuyển khoản / mã giao dịch thẻ")

    @model_validator(mode="after")
    def cash_fields(self) -> "SplitPaymentIn":
        if self.method != "CASH" and self.cash_received is not None:
            raise ValueError("Chỉ nhập cash_received cho khoản tiền mặt")
        return self


class OrderCreate(StrictModel):
    """Không có trường giá / tổng tiền nào: backend tự tính lại toàn bộ (gửi lên sẽ bị từ chối)."""

    customer_id: int | None = Field(None, description="Bỏ trống = khách lẻ")
    items: Annotated[list[OrderItemIn], Field(min_length=1, max_length=100)]
    discount: DiscountIn | None = None
    # Một phương thức: dùng `payment` (số tiền = tổng đơn do backend tính).
    # Kết hợp 2–3 phương thức: dùng `payments`, mỗi khoản ghi số tiền, mỗi phương thức tối đa một khoản.
    payment: PaymentIn | None = None
    payments: Annotated[list[SplitPaymentIn], Field(min_length=2, max_length=3)] | None = None
    note: Annotated[
        Annotated[str, StringConstraints(max_length=500)] | None, BeforeValidator(empty_to_none)
    ] = None
    service_type: Literal["DINE_IN", "TAKEAWAY"] | None = Field(
        None, description="Đơn có món ăn: mặc định mang đi"
    )
    table_label: Annotated[
        Annotated[str, StringConstraints(strip_whitespace=True, max_length=20)] | None,
        BeforeValidator(empty_to_none),
    ] = Field(None, description="Số bàn — bắt buộc khi ăn tại chỗ")

    @field_validator("items")
    @classmethod
    def unique_products(cls, items: list[OrderItemIn]) -> list[OrderItemIn]:
        # Cùng món khác ghi chú được tách dòng ("phở" + "phở không hành"); cùng món cùng ghi chú thì gộp số lượng
        if len({(item.product_id, item.note, tuple(item.option_ids)) for item in items}) != len(items):
            raise ValueError(
                "Mỗi sản phẩm (cùng ghi chú) chỉ xuất hiện một dòng trong đơn (hãy tăng số lượng)"
            )
        return items

    @model_validator(mode="after")
    def table_for_dine_in(self) -> "OrderCreate":
        if self.service_type == "DINE_IN" and not self.table_label:
            raise ValueError("Ăn tại chỗ cần nhập số bàn")
        return self

    @field_validator("payments")
    @classmethod
    def unique_methods(cls, payments: list[SplitPaymentIn] | None) -> list[SplitPaymentIn] | None:
        if payments and len({p.method for p in payments}) != len(payments):
            raise ValueError("Mỗi phương thức thanh toán chỉ xuất hiện một lần")
        return payments

    @model_validator(mode="after")
    def one_payment_form(self) -> "OrderCreate":
        if (self.payment is None) == (self.payments is None):
            raise ValueError("Gửi đúng một trong hai: payment (một phương thức) hoặc payments (kết hợp)")
        return self


class CustomerRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    code: str
    name: str
    phone: str | None


class OrderItemOptionOut(BaseModel):
    group_name: str
    option_name: str
    price_delta: Decimal


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
    is_dish: bool = Field(description="Món chế biến: đã trừ nguyên liệu, trả lại không nhập kho")
    note: str | None = Field(description="Ghi chú món cho bếp")
    options: list[OrderItemOptionOut] = Field(description="Lựa chọn đã chọn (giá đã cộng vào unit_price)")
    kitchen_status: Literal["NEW", "COOKING", "READY", "SERVED"] | None = Field(
        description="Trạng thái ở bếp (null: hàng hóa, không qua bếp)"
    )
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
    service_type: Literal["DINE_IN", "TAKEAWAY"] | None
    table_label: str | None
    queue_number: int | None = Field(description="Số thứ tự trong ngày để gọi khách (đơn có món ăn)")
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
    refund_method: Literal["CASH", "BANK_TRANSFER", "CARD"] | None = Field(
        None,
        description="Phương thức hoàn (một trong các phương thức khách đã trả). Bỏ trống: đơn một phương thức → "
        "phương thức đó; thanh toán kết hợp → tiền mặt nếu có",
    )

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
