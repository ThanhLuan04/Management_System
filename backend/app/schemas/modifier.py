from decimal import Decimal
from typing import Annotated

from pydantic import AfterValidator, BaseModel, Field, StringConstraints, field_validator, model_validator

from app.schemas.common import StrictModel

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]


def _whole_dong(value: Decimal) -> Decimal:
    if value != value.to_integral_value():
        raise ValueError("Giá phải là số đồng nguyên")
    return value


PriceDelta = Annotated[
    Decimal, Field(ge=Decimal("-999999999"), le=Decimal("999999999")), AfterValidator(_whole_dong)
]


# ---------- Ghi ----------


class OptionIngredientIn(StrictModel):
    ingredient_id: int
    quantity: Annotated[int, Field(ge=1, le=1_000_000)]


class OptionIn(StrictModel):
    id: int | None = Field(None, description="Có id = sửa lựa chọn đã có; không có = thêm mới")
    name: Name
    price_delta: PriceDelta = Field(Decimal("0"), description="Giá cộng thêm vào giá món (có thể âm)")
    ingredients: Annotated[list[OptionIngredientIn], Field(max_length=20)] = Field(
        default_factory=list, description="Nguyên liệu trừ thêm cho 1 phần"
    )

    @field_validator("ingredients")
    @classmethod
    def unique_ingredients(cls, items: list[OptionIngredientIn]) -> list[OptionIngredientIn]:
        if len({i.ingredient_id for i in items}) != len(items):
            raise ValueError("Nguyên liệu bị lặp trong cùng một lựa chọn")
        return items


class GroupIn(StrictModel):
    """Lưu cả nhóm một lần. Lựa chọn cũ không có trong danh sách sẽ bị ngừng dùng (không xóa — đơn cũ còn tham chiếu)."""

    name: Name
    min_select: Annotated[int, Field(ge=0, le=20)] = 0
    max_select: Annotated[int, Field(ge=1, le=20)] = 1
    is_active: bool = True
    options: Annotated[list[OptionIn], Field(min_length=1, max_length=50)]

    @model_validator(mode="after")
    def check_limits(self) -> "GroupIn":
        if self.min_select > self.max_select:
            raise ValueError("Số lựa chọn tối thiểu không được lớn hơn tối đa")
        if self.min_select > len(self.options):
            raise ValueError("Số lựa chọn tối thiểu lớn hơn số lựa chọn có trong nhóm")
        names = [o.name.casefold() for o in self.options]
        if len(set(names)) != len(names):
            raise ValueError("Tên lựa chọn bị trùng trong nhóm")
        ids = [o.id for o in self.options if o.id is not None]
        if len(set(ids)) != len(ids):
            raise ValueError("Lựa chọn bị lặp")
        return self


class ProductModifiersUpdate(StrictModel):
    group_ids: Annotated[list[int], Field(max_length=10, description="Theo thứ tự hiển thị ở quầy")]

    @field_validator("group_ids")
    @classmethod
    def unique(cls, ids: list[int]) -> list[int]:
        if len(set(ids)) != len(ids):
            raise ValueError("Nhóm tùy chọn bị lặp")
        return ids


# ---------- Đọc ----------


class IngredientBrief(BaseModel):
    id: int
    sku: str
    name: str
    unit: str


class OptionIngredientOut(BaseModel):
    ingredient: IngredientBrief
    quantity: int


class OptionOut(BaseModel):
    id: int
    name: str
    price_delta: Decimal
    ingredients: list[OptionIngredientOut]


class GroupOut(BaseModel):
    id: int
    name: str
    min_select: int
    max_select: int
    is_active: bool
    options: list[OptionOut] = Field(description="Chỉ lựa chọn đang dùng")
    dish_count: int = Field(description="Số món đang gắn nhóm này")


class OptionRef(BaseModel):
    id: int
    name: str
    price_delta: Decimal


class GroupRef(BaseModel):
    """Nhóm tùy chọn của một món — đủ để quầy hiện hộp chọn."""

    id: int
    name: str
    min_select: int
    max_select: int
    options: list[OptionRef]
