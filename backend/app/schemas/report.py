from datetime import date, datetime
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, Field

from app.schemas.sales import OrderSummaryOut
from app.schemas.user import UserRef

GroupBy = Literal["day", "week", "month"]


class Period(BaseModel):
    date_from: date
    date_to: date
    group_by: GroupBy


class RevenueRow(BaseModel):
    """Số liệu một kỳ (ngày/tuần/tháng). Định nghĩa: docs/01-business-spec.md §7.7."""

    period: date = Field(description="Ngày đầu kỳ")
    order_count: int = Field(description="Số đơn COMPLETED bán trong kỳ")
    gross_revenue: Decimal = Field(description="Tổng tiền đơn COMPLETED (theo ngày bán)")
    refunds: Decimal = Field(description="Tiền hoàn trả (theo ngày trả)")
    net_revenue: Decimal = Field(description="Doanh thu thuần = doanh thu gộp − tiền hoàn")
    cogs: Decimal = Field(description="Giá vốn hàng bán − giá vốn hàng trả nhập lại kho")
    gross_profit: Decimal = Field(description="Lợi nhuận gộp = doanh thu thuần − giá vốn hàng bán")


class RevenueTotals(BaseModel):
    order_count: int
    gross_revenue: Decimal
    refunds: Decimal
    net_revenue: Decimal
    cogs: Decimal
    gross_profit: Decimal
    average_order_value: Decimal = Field(description="Doanh thu gộp / số đơn")


class RevenueReport(BaseModel):
    period: Period
    totals: RevenueTotals
    series: list[RevenueRow]


class TopProductRow(BaseModel):
    product_id: int
    sku: str
    name: str
    quantity: int = Field(description="Số lượng bán ròng = bán − trả lại trong kỳ")
    revenue: Decimal = Field(description="Doanh thu ròng = thành tiền sau giảm − tiền hoàn trong kỳ")


class InventoryReportRow(BaseModel):
    product_id: int
    sku: str
    name: str
    category_name: str
    unit: str
    is_active: bool
    quantity: int
    min_stock: int
    is_low_stock: bool
    avg_cost: Decimal
    stock_value: Decimal


class InventoryReport(BaseModel):
    product_count: int
    total_quantity: int
    total_value: Decimal = Field(description="Σ tồn × giá vốn bình quân")
    low_stock_count: int
    items: list[InventoryReportRow]


class SupplierPurchaseRow(BaseModel):
    supplier_id: int
    supplier_code: str
    supplier_name: str
    purchase_count: int
    total_quantity: int
    total_amount: Decimal


class DashboardKpis(BaseModel):
    today_net_revenue: Decimal
    today_order_count: int
    net_revenue: Decimal
    gross_revenue: Decimal
    refunds: Decimal
    order_count: int
    gross_profit: Decimal
    active_product_count: int
    low_stock_count: int
    inventory_value: Decimal


class LowStockItem(BaseModel):
    product_id: int
    sku: str
    name: str
    quantity: int
    min_stock: int


class Dashboard(BaseModel):
    period: Period
    kpis: DashboardKpis
    revenue_series: list[RevenueRow]
    top_products: list[TopProductRow]
    recent_orders: list[OrderSummaryOut]
    low_stock_items: list[LowStockItem]


class MethodAmount(BaseModel):
    method: str
    amount: Decimal


class MySales(BaseModel):
    """Doanh số trong ngày của chính người gọi — dùng để đối chiếu tiền mặt khi giao ca."""

    date: date
    user: UserRef
    order_count: int
    gross_revenue: Decimal
    refunds: Decimal
    net_revenue: Decimal
    received_by_method: list[MethodAmount] = Field(description="Tiền đã thu theo phương thức")
    refunded_by_method: list[MethodAmount] = Field(description="Tiền đã hoàn theo phương thức")
    cash_in_drawer: Decimal = Field(description="Tiền mặt thu − tiền mặt hoàn")


# ---------- Cài đặt & audit ----------


class SettingsOut(BaseModel):
    store_name: str
    store_address: str
    store_phone: str
    return_window_days: int
    max_discount_percent_cashier: Decimal | None = None
    max_discount_percent_manager: Decimal | None = None
    my_max_discount_percent: Decimal | None = Field(
        None, description="Giới hạn giảm giá của chính người gọi (null = không giới hạn)"
    )


class AuditLogOut(BaseModel):
    id: int
    user: UserRef | None
    action: str
    entity_type: str | None
    entity_id: int | None
    old_values: dict[str, Any] | None
    new_values: dict[str, Any] | None
    ip_address: str | None
    created_at: datetime
