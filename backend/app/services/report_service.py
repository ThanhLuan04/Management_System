"""
Báo cáo — mọi số liệu tính trực tiếp từ dữ liệu giao dịch, theo định nghĩa ở docs/01-business-spec.md §7.7:

    doanh thu gộp   = Σ total_amount các đơn COMPLETED          (ghi nhận theo ngày bán)
    tiền hoàn       = Σ total_refund các phiếu trả của đơn đó    (ghi nhận theo ngày trả)
    doanh thu thuần = doanh thu gộp − tiền hoàn
    giá vốn (COGS)  = Σ SL × giá vốn lúc bán − Σ SL × giá vốn hàng trả CÒN BÁN ĐƯỢC
    lợi nhuận gộp   = doanh thu thuần − giá vốn

Đơn đã hủy bị loại hoàn toàn. "Ngày" tính theo giờ Việt Nam.
"""

from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import case, func, literal_column, select
from sqlalchemy.orm import Session

from app.models import (
    Category,
    Inventory,
    ItemCondition,
    OrderStatus,
    Payment,
    Product,
    PurchaseOrder,
    PurchaseOrderItem,
    PurchaseStatus,
    SalesOrder,
    SalesOrderItem,
    SalesReturn,
    SalesReturnItem,
    Supplier,
    User,
)
from app.schemas.report import (
    Dashboard,
    DashboardKpis,
    InventoryReport,
    InventoryReportRow,
    LowStockItem,
    MethodAmount,
    MySales,
    Period,
    RevenueReport,
    RevenueRow,
    RevenueTotals,
    SupplierPurchaseRow,
    TopProductRow,
)
from app.services import sales_service
from app.services.pricing import round_money
from app.utils.time import vn_day_range, vn_today

ZERO = Decimal("0")
_VN = literal_column("'Asia/Ho_Chi_Minh'")
_GROUP_UNITS = {"day": "'day'", "week": "'week'", "month": "'month'"}


def _bucket(column, group_by: str):
    """Ngày đầu kỳ (theo giờ VN) của một cột TIMESTAMPTZ. group_by đã được whitelist → dùng literal an toàn."""
    unit = literal_column(_GROUP_UNITS[group_by])
    return func.date_trunc(unit, func.timezone(_VN, column))


def _periods(date_from: date, date_to: date, group_by: str) -> list[date]:
    if group_by == "day":
        start, step = date_from, None
    elif group_by == "week":
        start, step = date_from - timedelta(days=date_from.weekday()), None  # tuần bắt đầu thứ Hai
    else:
        start = date_from.replace(day=1)
        step = "month"
    periods = []
    current = start
    while current <= date_to:
        periods.append(current)
        if step == "month":
            current = (current.replace(day=28) + timedelta(days=4)).replace(day=1)
        else:
            current += timedelta(days=7 if group_by == "week" else 1)
    return periods


def _in_range(column, date_from: date, date_to: date):
    start, end = vn_day_range(date_from, date_to)
    return column >= start, column < end


def _grouped(db: Session, stmt) -> dict[date, tuple]:
    return {row[0].date(): row[1:] for row in db.execute(stmt).all()}


# ====================== Doanh thu & lợi nhuận ======================


def revenue(db: Session, date_from: date, date_to: date, group_by: str) -> RevenueReport:
    completed = SalesOrder.status == OrderStatus.COMPLETED
    sale_bucket = _bucket(SalesOrder.created_at, group_by)
    return_bucket = _bucket(SalesReturn.created_at, group_by)

    sales = _grouped(
        db,
        select(sale_bucket, func.count(SalesOrder.id), func.sum(SalesOrder.total_amount))
        .where(completed, *_in_range(SalesOrder.created_at, date_from, date_to))
        .group_by(sale_bucket),
    )
    cost_sold = _grouped(
        db,
        select(sale_bucket, func.sum(SalesOrderItem.quantity * SalesOrderItem.unit_cost))
        .join(SalesOrderItem, SalesOrderItem.sales_order_id == SalesOrder.id)
        .where(completed, *_in_range(SalesOrder.created_at, date_from, date_to))
        .group_by(sale_bucket),
    )
    refunds = _grouped(
        db,
        select(return_bucket, func.sum(SalesReturn.total_refund))
        .join(SalesOrder, SalesOrder.id == SalesReturn.sales_order_id)
        .where(completed, *_in_range(SalesReturn.created_at, date_from, date_to))
        .group_by(return_bucket),
    )
    restocked = case(
        (
            SalesReturnItem.condition == ItemCondition.RESELLABLE,
            SalesReturnItem.quantity * SalesReturnItem.unit_cost,
        ),
        else_=0,
    )
    cost_returned = _grouped(
        db,
        select(return_bucket, func.sum(restocked))
        .select_from(SalesReturnItem)
        .join(SalesReturn, SalesReturn.id == SalesReturnItem.sales_return_id)
        .join(SalesOrder, SalesOrder.id == SalesReturn.sales_order_id)
        .where(completed, *_in_range(SalesReturn.created_at, date_from, date_to))
        .group_by(return_bucket),
    )

    series = []
    for period in _periods(date_from, date_to, group_by):
        count, gross = sales.get(period, (0, ZERO))
        refund = refunds.get(period, (ZERO,))[0]
        cogs = round_money(cost_sold.get(period, (ZERO,))[0] - cost_returned.get(period, (ZERO,))[0])
        net = gross - refund
        series.append(
            RevenueRow(
                period=period,
                order_count=count,
                gross_revenue=round_money(gross),
                refunds=round_money(refund),
                net_revenue=round_money(net),
                cogs=cogs,
                gross_profit=round_money(net - cogs),
            )
        )

    order_count = sum(r.order_count for r in series)
    gross_total = sum((r.gross_revenue for r in series), ZERO)
    totals = RevenueTotals(
        order_count=order_count,
        gross_revenue=gross_total,
        refunds=sum((r.refunds for r in series), ZERO),
        net_revenue=sum((r.net_revenue for r in series), ZERO),
        cogs=sum((r.cogs for r in series), ZERO),
        gross_profit=sum((r.gross_profit for r in series), ZERO),
        average_order_value=round_money(gross_total / order_count) if order_count else round_money(ZERO),
    )
    return RevenueReport(
        period=Period(date_from=date_from, date_to=date_to, group_by=group_by), totals=totals, series=series
    )


# ====================== Sản phẩm bán chạy ======================


def top_products(db: Session, date_from: date, date_to: date, limit: int, by: str) -> list[TopProductRow]:
    """Bán ròng trong kỳ: số bán (theo ngày bán) trừ số trả lại (theo ngày trả); đơn hủy không tính."""
    completed = SalesOrder.status == OrderStatus.COMPLETED
    sold = db.execute(
        select(
            SalesOrderItem.product_id, func.sum(SalesOrderItem.quantity), func.sum(SalesOrderItem.line_total)
        )
        .join(SalesOrder, SalesOrder.id == SalesOrderItem.sales_order_id)
        .where(completed, *_in_range(SalesOrder.created_at, date_from, date_to))
        .group_by(SalesOrderItem.product_id)
    ).all()
    returned = {
        product_id: (qty, refund)
        for product_id, qty, refund in db.execute(
            select(
                SalesReturnItem.product_id,
                func.sum(SalesReturnItem.quantity),
                func.sum(SalesReturnItem.refund_amount),
            )
            .join(SalesReturn, SalesReturn.id == SalesReturnItem.sales_return_id)
            .join(SalesOrder, SalesOrder.id == SalesReturn.sales_order_id)
            .where(completed, *_in_range(SalesReturn.created_at, date_from, date_to))
            .group_by(SalesReturnItem.product_id)
        ).all()
    }

    totals: dict[int, list] = {}
    for product_id, qty, revenue_ in sold:
        back_qty, back_refund = returned.get(product_id, (0, ZERO))
        totals[product_id] = [int(qty) - int(back_qty), revenue_ - back_refund]
    if not totals:
        return []

    names = {p.id: p for p in db.scalars(select(Product).where(Product.id.in_(totals))).unique()}
    rows = [
        TopProductRow(
            product_id=pid,
            sku=names[pid].sku,
            name=names[pid].name,
            quantity=qty,
            revenue=round_money(revenue_),
        )
        for pid, (qty, revenue_) in totals.items()
    ]
    key = (lambda r: (r.quantity, r.revenue)) if by == "quantity" else (lambda r: (r.revenue, r.quantity))
    return sorted(rows, key=key, reverse=True)[:limit]


# ====================== Tồn kho ======================


def inventory_report(db: Session, *, low_stock: bool, include_inactive: bool) -> InventoryReport:
    stmt = (
        select(Product, Inventory, Category.name)
        .join(Inventory, Inventory.product_id == Product.id)
        .join(Category, Category.id == Product.category_id)
        .order_by(Product.name)
    )
    if not include_inactive:
        stmt = stmt.where(Product.is_active.is_(True))
    if low_stock:
        stmt = stmt.where(Product.is_active.is_(True), Inventory.quantity <= Product.min_stock)

    items = []
    for product, inventory, category_name in db.execute(stmt).unique():
        items.append(
            InventoryReportRow(
                product_id=product.id,
                sku=product.sku,
                name=product.name,
                category_name=category_name,
                unit=product.unit,
                is_active=product.is_active,
                quantity=inventory.quantity,
                min_stock=product.min_stock,
                is_low_stock=product.is_active and inventory.quantity <= product.min_stock,
                avg_cost=inventory.avg_cost,
                stock_value=round_money(inventory.quantity * inventory.avg_cost),
            )
        )
    return InventoryReport(
        product_count=len(items),
        total_quantity=sum(i.quantity for i in items),
        total_value=sum((i.stock_value for i in items), round_money(ZERO)),
        low_stock_count=sum(1 for i in items if i.is_low_stock),
        items=items,
    )


def inventory_value(db: Session) -> Decimal:
    return round_money(db.scalar(select(func.coalesce(func.sum(Inventory.quantity * Inventory.avg_cost), 0))))


# ====================== Nhập hàng theo nhà cung cấp ======================


def purchases_by_supplier(db: Session, date_from: date, date_to: date) -> list[SupplierPurchaseRow]:
    """Chỉ tính phiếu đã xác nhận, theo ngày xác nhận (ngày hàng thực sự vào kho)."""
    confirmed = (
        PurchaseOrder.status == PurchaseStatus.CONFIRMED,
        *_in_range(PurchaseOrder.confirmed_at, date_from, date_to),
    )
    orders = db.execute(
        select(
            Supplier.id,
            Supplier.code,
            Supplier.name,
            func.count(PurchaseOrder.id),
            func.sum(PurchaseOrder.total_amount),
        )
        .join(PurchaseOrder, PurchaseOrder.supplier_id == Supplier.id)
        .where(*confirmed)
        .group_by(Supplier.id, Supplier.code, Supplier.name)
    ).all()
    # Đếm số lượng ở truy vấn riêng: join với bảng dòng hàng sẽ nhân bản total_amount của phiếu
    quantities = dict(
        db.execute(
            select(PurchaseOrder.supplier_id, func.sum(PurchaseOrderItem.quantity))
            .join(PurchaseOrderItem, PurchaseOrderItem.purchase_order_id == PurchaseOrder.id)
            .where(*confirmed)
            .group_by(PurchaseOrder.supplier_id)
        ).all()
    )
    rows = [
        SupplierPurchaseRow(
            supplier_id=sid,
            supplier_code=code,
            supplier_name=name,
            purchase_count=count,
            total_quantity=int(quantities.get(sid, 0)),
            total_amount=total,
        )
        for sid, code, name, count, total in orders
    ]
    return sorted(rows, key=lambda r: r.total_amount, reverse=True)


# ====================== Dashboard ======================


def dashboard(db: Session, date_from: date, date_to: date, group_by: str) -> Dashboard:
    period_report = revenue(db, date_from, date_to, group_by)
    today = vn_today()
    today_report = revenue(db, today, today, "day").totals

    active_count = db.scalar(select(func.count()).select_from(Product).where(Product.is_active.is_(True)))
    low_stock_rows = db.execute(
        select(Product.id, Product.sku, Product.name, Inventory.quantity, Product.min_stock)
        .join(Inventory, Inventory.product_id == Product.id)
        .where(Product.is_active.is_(True), Inventory.quantity <= Product.min_stock)
        .order_by(Inventory.quantity, Product.name)
    ).all()
    recent = list(db.scalars(select(SalesOrder).order_by(SalesOrder.created_at.desc()).limit(10)).unique())

    totals = period_report.totals
    return Dashboard(
        period=period_report.period,
        kpis=DashboardKpis(
            today_net_revenue=today_report.net_revenue,
            today_order_count=today_report.order_count,
            net_revenue=totals.net_revenue,
            gross_revenue=totals.gross_revenue,
            refunds=totals.refunds,
            order_count=totals.order_count,
            gross_profit=totals.gross_profit,
            active_product_count=active_count,
            low_stock_count=len(low_stock_rows),
            inventory_value=inventory_value(db),
        ),
        revenue_series=period_report.series,
        top_products=top_products(db, date_from, date_to, 5, "revenue"),
        recent_orders=sales_service.order_summaries(db, recent),
        low_stock_items=[
            LowStockItem(product_id=pid, sku=sku, name=name, quantity=qty, min_stock=min_stock)
            for pid, sku, name, qty, min_stock in low_stock_rows[:10]
        ],
    )


# ====================== Doanh số của tôi (giao ca) ======================


def my_sales(db: Session, user: User, day: date) -> MySales:
    in_day_order = _in_range(SalesOrder.created_at, day, day)
    count, gross = db.execute(
        select(func.count(SalesOrder.id), func.coalesce(func.sum(SalesOrder.total_amount), 0)).where(
            SalesOrder.created_by == user.id, SalesOrder.status == OrderStatus.COMPLETED, *in_day_order
        )
    ).one()
    refunds = db.scalar(
        select(func.coalesce(func.sum(SalesReturn.total_refund), 0)).where(
            SalesReturn.created_by == user.id, *_in_range(SalesReturn.created_at, day, day)
        )
    )

    by_method: dict[str, dict[str, Decimal]] = defaultdict(lambda: defaultdict(lambda: ZERO))
    for payment_type, method, amount in db.execute(
        select(Payment.type, Payment.method, func.sum(Payment.amount))
        .where(Payment.created_by == user.id, *_in_range(Payment.created_at, day, day))
        .group_by(Payment.type, Payment.method)
    ):
        by_method[payment_type][method] = amount

    def as_list(payment_type: str) -> list[MethodAmount]:
        return [MethodAmount(method=m, amount=a) for m, a in sorted(by_method[payment_type].items())]

    return MySales(
        date=day,
        user={"id": user.id, "full_name": user.full_name},
        order_count=count,
        gross_revenue=round_money(gross),
        refunds=round_money(refunds),
        net_revenue=round_money(gross - refunds),
        received_by_method=as_list("PAYMENT"),
        refunded_by_method=as_list("REFUND"),
        cash_in_drawer=round_money(by_method["PAYMENT"]["CASH"] - by_method["REFUND"]["CASH"]),
    )
