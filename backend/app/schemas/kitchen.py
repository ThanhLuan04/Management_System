from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.common import StrictModel

Status = Literal["NEW", "COOKING", "READY", "SERVED"]


class KitchenItemOut(BaseModel):
    id: int
    product_name: str
    unit: str
    quantity: int
    note: str | None
    options: list[str] = Field(description="Tên lựa chọn: ['Lớn', 'Thêm trứng']")
    kitchen_status: Status
    kitchen_updated_at: datetime | None


class KitchenTicketOut(BaseModel):
    order_id: int
    code: str
    queue_number: int | None
    service_type: Literal["DINE_IN", "TAKEAWAY"] | None
    table_label: str | None
    note: str | None = Field(description="Ghi chú chung của đơn")
    cancelled: bool = Field(description="Đơn bị hủy khi bếp chưa giao xong — dừng làm, bấm 'Đã biết' để ẩn")
    cancel_reason: str | None
    cashier: str
    created_at: datetime
    items: list[KitchenItemOut] = Field(description="Chỉ các dòng món ăn (hàng hóa không qua bếp)")


class KitchenStatusUpdate(StrictModel):
    status: Status
