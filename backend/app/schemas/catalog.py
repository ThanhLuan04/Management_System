from datetime import datetime
from decimal import Decimal
from typing import Annotated

from pydantic import AfterValidator, BaseModel, BeforeValidator, ConfigDict, Field, StringConstraints

from app.schemas.common import StrictModel, empty_to_none

Name100 = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
OptionalLongText = Annotated[
    Annotated[str, StringConstraints(max_length=2000)] | None, BeforeValidator(empty_to_none)
]


def _normalize_sku(value: str) -> str:
    return value.strip().upper()


def _whole_dong(value: Decimal) -> Decimal:
    if value != value.to_integral_value():
        raise ValueError("Giá bán phải là số đồng nguyên (không có phần lẻ)")
    return value


Sku = Annotated[str, BeforeValidator(_normalize_sku), StringConstraints(pattern=r"^[A-Z0-9_-]{1,50}$")]
Barcode = Annotated[
    Annotated[str, StringConstraints(pattern=r"^[A-Za-z0-9-]{4,50}$")] | None, BeforeValidator(empty_to_none)
]
SalePrice = Annotated[Decimal, Field(ge=0, le=Decimal("999999999999")), AfterValidator(_whole_dong)]


# ---------- Danh mục ----------


class CategoryRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str


class CategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    parent_id: int | None
    parent_name: str | None = None
    description: str | None
    is_active: bool
    product_count: int = Field(0, description="Số sản phẩm đang kinh doanh thuộc trực tiếp danh mục")
    created_at: datetime
    updated_at: datetime


class CategoryTreeOut(CategoryOut):
    children: list[CategoryOut] = []


class CategoryCreate(StrictModel):
    name: Name100
    parent_id: int | None = None
    description: OptionalLongText = None


class CategoryUpdate(StrictModel):
    name: Name100 | None = None
    parent_id: int | None = None
    description: OptionalLongText = None
    is_active: bool | None = None


# ---------- Thương hiệu ----------


class BrandOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    is_active: bool
    created_at: datetime
    updated_at: datetime


class BrandRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str


class BrandCreate(StrictModel):
    name: Name100


class BrandUpdate(StrictModel):
    name: Name100 | None = None
    is_active: bool | None = None


# ---------- Sản phẩm ----------


class ProductOut(BaseModel):
    id: int
    sku: str
    barcode: str | None
    name: str
    category: CategoryRef
    brand: BrandRef | None
    unit: str
    sale_price: Decimal
    min_stock: int
    image_url: str | None
    description: str | None
    is_active: bool
    quantity: int = Field(description="Tồn kho hiện tại (chỉ đọc)")
    is_low_stock: bool
    avg_cost: Decimal | None = Field(
        None, description="Giá vốn bình quân — chỉ có trong response khi người dùng có quyền cost.view"
    )
    created_at: datetime
    updated_at: datetime


class ProductCreate(StrictModel):
    sku: Sku
    barcode: Barcode = None
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=255)]
    category_id: int
    brand_id: int | None = None
    unit: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=20)]
    sale_price: SalePrice
    min_stock: Annotated[int, Field(ge=0, le=1_000_000)] = 0
    description: OptionalLongText = None
    is_active: bool = True


class ProductUpdate(StrictModel):
    """Không có quantity/avg_cost: tồn kho chỉ thay đổi qua nhập hàng, bán, trả hàng, điều chỉnh kho."""

    sku: Sku | None = None
    barcode: Barcode = None
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=255)] | None = None
    category_id: int | None = None
    brand_id: int | None = None
    unit: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=20)] | None = None
    sale_price: SalePrice | None = None
    min_stock: Annotated[int, Field(ge=0, le=1_000_000)] | None = None
    description: OptionalLongText = None
    is_active: bool | None = None
