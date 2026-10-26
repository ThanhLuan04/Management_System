import re
from typing import Annotated, Any

from fastapi import Query
from pydantic import AfterValidator, BaseModel, BeforeValidator, ConfigDict, Field, StringConstraints


class StrictModel(BaseModel):
    """Schema request: cắt khoảng trắng hai đầu và từ chối trường lạ (ví dụ client cố gửi 'quantity' vào form sản phẩm)."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class ErrorDetail(BaseModel):
    field: str
    message: str


class ErrorBody(BaseModel):
    code: str = Field(examples=["VALIDATION_ERROR"])
    message: str = Field(examples=["Dữ liệu không hợp lệ"])
    details: list[ErrorDetail] | dict[str, Any] | None = None


class ErrorResponse(BaseModel):
    """Định dạng lỗi thống nhất của mọi API (dùng để mô tả trong Swagger)."""

    error: ErrorBody


class Page[T](BaseModel):
    items: list[T]
    page: int
    page_size: int
    total: int


class PageParams:
    """Tham số phân trang/sắp xếp dùng chung cho mọi API danh sách."""

    def __init__(
        self,
        page: Annotated[int, Query(ge=1, description="Trang, bắt đầu từ 1")] = 1,
        page_size: Annotated[int, Query(ge=1, le=100, description="Số bản ghi mỗi trang")] = 20,
        sort: Annotated[str | None, Query(description="Tên trường, thêm '-' để giảm dần")] = None,
    ):
        self.page = page
        self.page_size = page_size
        self.sort = sort


def empty_to_none(value: Any) -> Any:
    if isinstance(value, str) and not value.strip():
        return None
    return value


def _check_password_strength(value: str) -> str:
    if not re.search(r"[A-Za-z]", value) or not re.search(r"\d", value):
        raise ValueError("Mật khẩu phải có cả chữ và số")
    return value


def _check_phone(value: str) -> str:
    if not re.fullmatch(r"\+?[0-9][0-9 .-]{7,18}", value):
        raise ValueError("Số điện thoại không hợp lệ")
    return value


# Mật khẩu giữ nguyên từng ký tự người dùng gõ, kể cả khoảng trắng hai đầu
Password = Annotated[
    str,
    StringConstraints(min_length=8, max_length=128, strip_whitespace=False),
    AfterValidator(_check_password_strength),
]
Phone = Annotated[
    Annotated[str, StringConstraints(max_length=20), AfterValidator(_check_phone)] | None,
    BeforeValidator(empty_to_none),
]
