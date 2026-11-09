from datetime import datetime
from decimal import Decimal
from typing import Annotated, Literal

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
Kind = Literal["GOODS", "DISH", "INGREDIENT"]
PurchaseUnit = Annotated[
    Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=20)] | None,
    BeforeValidator(empty_to_none),
]
PurchaseFactor = Annotated[int, Field(ge=1, le=1_000_000, description="1 đơn vị nhập = bao nhiêu đơn vị kho")]


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


class IngredientRef(BaseModel):
    id: int
    sku: str
    name: str
    unit: str
    kind: Kind
    is_active: bool
    quantity: int = Field(description="Tồn hiện tại theo đơn vị kho")
    avg_cost: Decimal | None = Field(None, description="Chỉ có khi người dùng có quyền cost.view")


class RecipeLineOut(BaseModel):
    ingredient: IngredientRef
    quantity: int = Field(description="Lượng cho 1 phần, theo đơn vị kho của nguyên liệu")


class ProductOut(BaseModel):
    id: int
    sku: str
    barcode: str | None
    name: str
    kind: Kind
    category: CategoryRef
    brand: BrandRef | None
    unit: str
    purchase_unit: str | None
    purchase_factor: int
    sale_price: Decimal
    min_stock: int
    image_url: str | None
    description: str | None
    is_active: bool
    quantity: int = Field(
        description="Tồn kho hiện tại (chỉ đọc). Món ăn: số phần còn làm được từ nguyên liệu trong kho"
    )
    is_low_stock: bool
    recipe: list[RecipeLineOut] = Field(description="Công thức định lượng (chỉ món ăn)")
    avg_cost: Decimal | None = Field(
        None,
        description="Giá vốn bình quân (món ăn: giá vốn ước tính theo công thức) — chỉ có khi có quyền cost.view",
    )
    created_at: datetime
    updated_at: datetime


class RecipeLineIn(StrictModel):
    ingredient_id: int
    quantity: Annotated[int, Field(ge=1, le=1_000_000)]


class RecipeUpdate(StrictModel):
    items: Annotated[list[RecipeLineIn], Field(max_length=30)]


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
    kind: Kind = Field("GOODS", description="Không đổi được sau khi tạo")
    purchase_unit: PurchaseUnit = None
    purchase_factor: PurchaseFactor = 1


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
    purchase_unit: PurchaseUnit = None
    purchase_factor: PurchaseFactor | None = None
