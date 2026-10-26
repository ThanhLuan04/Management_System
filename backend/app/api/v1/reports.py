from datetime import date, timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query

from app.api.deps import DbSession, require_permission
from app.core.permissions import Permission
from app.models import User
from app.schemas.report import (
    Dashboard,
    InventoryReport,
    MySales,
    RevenueReport,
    SupplierPurchaseRow,
    TopProductRow,
)
from app.services import report_service
from app.utils.csv_export import csv_response
from app.utils.dates import validate_date_range
from app.utils.time import vn_today

router = APIRouter(prefix="/reports", tags=["reports"])

ReportViewer = Annotated[User, Depends(require_permission(Permission.REPORTS_VIEW))]
OwnSalesViewer = Annotated[User, Depends(require_permission(Permission.REPORTS_OWN_SALES))]

MAX_RANGE_DAYS = 366
Format = Literal["json", "csv"]
GroupBy = Literal["day", "week", "month"]


def _range(date_from: date | None, date_to: date | None, default_days: int = 30) -> tuple[date, date]:
    """Mặc định: 30 ngày gần nhất tính đến hôm nay (giờ VN)."""
    date_to = date_to or vn_today()
    date_from = date_from or date_to - timedelta(days=default_days - 1)
    validate_date_range(date_from, date_to, MAX_RANGE_DAYS)
    return date_from, date_to


def _suffix(date_from: date, date_to: date) -> str:
    return f"{date_from:%Y%m%d}-{date_to:%Y%m%d}"


@router.get("/dashboard", response_model=Dashboard, summary="Số liệu tổng quan")
def dashboard(
    _: ReportViewer,
    db: DbSession,
    date_from: date | None = None,
    date_to: date | None = None,
    group_by: GroupBy = "day",
):
    date_from, date_to = _range(date_from, date_to)
    return report_service.dashboard(db, date_from, date_to, group_by)


@router.get(
    "/revenue",
    response_model=RevenueReport,
    summary="Doanh thu, tiền hoàn, giá vốn, lợi nhuận gộp theo kỳ (format=csv để tải file)",
)
def revenue(
    _: ReportViewer,
    db: DbSession,
    date_from: date | None = None,
    date_to: date | None = None,
    group_by: GroupBy = "day",
    format: Format = "json",
):
    date_from, date_to = _range(date_from, date_to)
    report = report_service.revenue(db, date_from, date_to, group_by)
    if format == "csv":
        return csv_response(
            f"doanh-thu-{_suffix(date_from, date_to)}.csv",
            ["Kỳ", "Số đơn", "Doanh thu gộp", "Tiền hoàn", "Doanh thu thuần", "Giá vốn", "Lợi nhuận gộp"],
            (
                [r.period, r.order_count, r.gross_revenue, r.refunds, r.net_revenue, r.cogs, r.gross_profit]
                for r in report.series
            ),
        )
    return report


@router.get("/top-products", response_model=list[TopProductRow], summary="Sản phẩm bán chạy (bán ròng)")
def top_products(
    _: ReportViewer,
    db: DbSession,
    date_from: date | None = None,
    date_to: date | None = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 10,
    by: Literal["quantity", "revenue"] = "quantity",
    format: Format = "json",
):
    date_from, date_to = _range(date_from, date_to)
    rows = report_service.top_products(db, date_from, date_to, limit, by)
    if format == "csv":
        return csv_response(
            f"ban-chay-{_suffix(date_from, date_to)}.csv",
            ["SKU", "Tên sản phẩm", "Số lượng bán ròng", "Doanh thu ròng"],
            ([r.sku, r.name, r.quantity, r.revenue] for r in rows),
        )
    return rows


@router.get("/inventory", response_model=InventoryReport, summary="Báo cáo tồn kho và giá trị tồn")
def inventory(
    _: ReportViewer,
    db: DbSession,
    low_stock: Annotated[bool, Query(description="Chỉ hàng sắp hết")] = False,
    include_inactive: bool = False,
    format: Format = "json",
):
    report = report_service.inventory_report(db, low_stock=low_stock, include_inactive=include_inactive)
    if format == "csv":
        return csv_response(
            f"ton-kho-{vn_today():%Y%m%d}.csv",
            [
                "SKU",
                "Tên sản phẩm",
                "Danh mục",
                "ĐVT",
                "Tồn",
                "Tồn tối thiểu",
                "Sắp hết",
                "Giá vốn BQ",
                "Giá trị tồn",
            ],
            (
                [
                    i.sku,
                    i.name,
                    i.category_name,
                    i.unit,
                    i.quantity,
                    i.min_stock,
                    i.is_low_stock,
                    i.avg_cost,
                    i.stock_value,
                ]
                for i in report.items
            ),
        )
    return report


@router.get(
    "/purchases-by-supplier",
    response_model=list[SupplierPurchaseRow],
    summary="Tổng nhập hàng theo nhà cung cấp (phiếu đã xác nhận)",
)
def purchases_by_supplier(
    _: ReportViewer,
    db: DbSession,
    date_from: date | None = None,
    date_to: date | None = None,
    format: Format = "json",
):
    date_from, date_to = _range(date_from, date_to)
    rows = report_service.purchases_by_supplier(db, date_from, date_to)
    if format == "csv":
        return csv_response(
            f"nhap-hang-theo-ncc-{_suffix(date_from, date_to)}.csv",
            ["Mã NCC", "Nhà cung cấp", "Số phiếu", "Tổng số lượng", "Tổng tiền"],
            (
                [r.supplier_code, r.supplier_name, r.purchase_count, r.total_quantity, r.total_amount]
                for r in rows
            ),
        )
    return rows


@router.get("/my-sales", response_model=MySales, summary="Doanh số trong ngày của tôi (đối chiếu giao ca)")
def my_sales(user: OwnSalesViewer, db: DbSession, day: Annotated[date | None, Query(alias="date")] = None):
    return report_service.my_sales(db, user, day or vn_today())
