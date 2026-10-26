from decimal import Decimal
from typing import Annotated

from pydantic import Field, StringConstraints

from app.schemas.common import StrictModel

Percent = Annotated[Decimal, Field(ge=0, le=100, decimal_places=2)]


class SettingsUpdate(StrictModel):
    """Chỉ gửi những thiết lập muốn đổi."""

    store_name: (
        Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=255)] | None
    ) = None
    store_address: Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)] | None = None
    store_phone: Annotated[str, StringConstraints(strip_whitespace=True, max_length=20)] | None = None
    max_discount_percent_cashier: Percent | None = None
    max_discount_percent_manager: Percent | None = None
    return_window_days: Annotated[int, Field(ge=0, le=365)] | None = None
