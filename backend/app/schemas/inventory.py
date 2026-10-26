from datetime import datetime
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, BeforeValidator, Field, StringConstraints, field_validator, model_validator

from app.schemas.common import StrictModel, empty_to_none
from app.schemas.user import UserRef

# Các trường có "Giá vốn" chỉ xuất hiện trong response khi người dùng có quyền cost.view
_COST_NOTE = "Chỉ có khi người dùng có quyền cost.view"


class InventoryItemOut(BaseModel):
    product_id: int
    sku: str
    name: str
    unit: str
    category_name: str
    is_active: bool
    quantity: int
    min_stock: int
    is_low_stock: bool
    avg_cost: Decimal | None = Field(None, description=_COST_NOTE)
    stock_value: Decimal | None = Field(None, description=_COST_NOTE)


class InventoryTransactionOut(BaseModel):
    id: int
    product_id: int
    sku: str
    product_name: str
    type: str
    quantity_change: int
    quantity_after: int
    unit_cost: Decimal | None = Field(None, description=_COST_NOTE)
    avg_cost_after: Decimal | None = Field(None, description=_COST_NOTE)
    reference_type: str
    reference_id: int
    reference_code: str | None = Field(None, description="Mã chứng từ gốc, ví dụ PN20261025-0001")
    note: str | None
    created_by: UserRef
    created_at: datetime


class ProductStockOut(BaseModel):
    product_id: int
    sku: str
    name: str
    unit: str
    quantity: int
    min_stock: int
    is_low_stock: bool
    avg_cost: Decimal | None = Field(None, description=_COST_NOTE)
    recent_transactions: list[InventoryTransactionOut]


class AdjustmentItemIn(StrictModel):
    product_id: int
    quantity_change: Annotated[int, Field(ge=-1_000_000, le=1_000_000)] | None = Field(
        None, description="Bắt buộc với ADJUSTMENT: số dương = tăng, số âm = giảm"
    )
    counted_quantity: Annotated[int, Field(ge=0, le=1_000_000)] | None = Field(
        None, description="Bắt buộc với STOCKTAKE: số lượng đếm thực tế"
    )


class AdjustmentCreate(StrictModel):
    type: Literal["ADJUSTMENT", "STOCKTAKE"]
    reason: Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=255)]
    note: Annotated[
        Annotated[str, StringConstraints(max_length=1000)] | None, BeforeValidator(empty_to_none)
    ] = None
    items: Annotated[list[AdjustmentItemIn], Field(min_length=1, max_length=500)]

    @field_validator("items")
    @classmethod
    def unique_products(cls, items: list[AdjustmentItemIn]) -> list[AdjustmentItemIn]:
        if len({item.product_id for item in items}) != len(items):
            raise ValueError("Mỗi sản phẩm chỉ được xuất hiện một lần trong phiếu")
        return items

    @model_validator(mode="after")
    def fields_match_type(self) -> "AdjustmentCreate":
        for item in self.items:
            if self.type == "ADJUSTMENT" and (
                item.quantity_change in (None, 0) or item.counted_quantity is not None
            ):
                raise ValueError(
                    "Phiếu điều chỉnh: mỗi dòng cần quantity_change khác 0 (không dùng counted_quantity)"
                )
            if self.type == "STOCKTAKE" and (
                item.counted_quantity is None or item.quantity_change is not None
            ):
                raise ValueError("Phiếu kiểm kê: mỗi dòng cần counted_quantity (không dùng quantity_change)")
        return self


class AdjustmentItemOut(BaseModel):
    id: int
    product_id: int
    sku: str
    product_name: str
    quantity_before: int
    quantity_change: int
    counted_quantity: int | None
    unit_cost: Decimal | None = Field(None, description=_COST_NOTE)


class AdjustmentSummaryOut(BaseModel):
    id: int
    code: str
    type: str
    reason: str
    note: str | None
    item_count: int
    created_by: UserRef
    created_at: datetime


class AdjustmentOut(AdjustmentSummaryOut):
    items: list[AdjustmentItemOut]
