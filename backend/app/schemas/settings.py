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
    # Tài khoản nhận chuyển khoản (mã VietQR ở màn hình bán hàng). Chuỗi rỗng = xóa (không hiện QR).
    bank_bin: Annotated[str, StringConstraints(strip_whitespace=True, pattern=r"^(\d{6})?$")] | None = Field(
        None, description="Mã BIN 6 số của ngân hàng theo NAPAS, vd. 970436 (Vietcombank)"
    )
    bank_account_number: (
        Annotated[str, StringConstraints(strip_whitespace=True, pattern=r"^([0-9A-Za-z]{1,19})?$")] | None
    ) = None
    bank_account_name: Annotated[str, StringConstraints(strip_whitespace=True, max_length=50)] | None = None
    kitchen_screen_enabled: bool | None = None
    auto_print_kitchen_ticket: bool | None = None
