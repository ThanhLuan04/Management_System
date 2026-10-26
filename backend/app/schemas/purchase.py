from datetime import datetime
from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, BeforeValidator, ConfigDict, Field, StringConstraints, field_validator

from app.schemas.common import StrictModel, empty_to_none
from app.schemas.user import UserRef

Money = Annotated[Decimal, Field(ge=0, le=Decimal("999999999999"), decimal_places=2)]


class PurchaseItemIn(StrictModel):
    product_id: int
    quantity: Annotated[int, Field(ge=1, le=1_000_000)]
    unit_cost: Money
    discount_amount: Money = Decimal("0")


class PurchaseCreate(StrictModel):
    """Chỉ gửi số lượng, đơn giá, chiết khấu — thành tiền và tổng phiếu do backend tính."""

    supplier_id: int
    note: Annotated[
        Annotated[str, StringConstraints(max_length=1000)] | None, BeforeValidator(empty_to_none)
    ] = None
    items: Annotated[list[PurchaseItemIn], Field(min_length=1, max_length=200)]

    @field_validator("items")
    @classmethod
    def unique_products(cls, items: list[PurchaseItemIn]) -> list[PurchaseItemIn]:
        if len({item.product_id for item in items}) != len(items):
            raise ValueError("Mỗi sản phẩm chỉ được xuất hiện một lần trong phiếu")
        return items


class SupplierRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    code: str
    name: str


class PurchaseItemOut(BaseModel):
    id: int
    product_id: int
    sku: str
    product_name: str
    unit: str
    quantity: int
    unit_cost: Decimal
    discount_amount: Decimal
    line_total: Decimal


class PurchaseSummaryOut(BaseModel):
    id: int
    code: str
    status: str
    supplier: SupplierRef
    total_amount: Decimal
    item_count: int
    note: str | None
    created_by: UserRef
    confirmed_by: UserRef | None
    confirmed_at: datetime | None
    cancelled_at: datetime | None
    created_at: datetime
    updated_at: datetime


class PurchaseOut(PurchaseSummaryOut):
    items: list[PurchaseItemOut]
