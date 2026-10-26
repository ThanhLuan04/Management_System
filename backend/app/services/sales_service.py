"""
Bán hàng tại quầy.

Một đơn hàng được tạo trong MỘT transaction: tạo đơn + dòng hàng, trừ kho, ghi sổ cái kho, ghi thanh toán.
Lỗi ở bất kỳ bước nào → rollback toàn bộ → không bao giờ có "đơn đã tạo nhưng chưa trừ kho".
"""

import hashlib
import json
import re
import uuid
from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from sqlalchemy import case, exists, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.models import (
    Customer,
    ItemCondition,
    OrderStatus,
    Payment,
    PaymentMethod,
    Product,
    SalesOrder,
    SalesOrderItem,
    SalesReturn,
    SalesReturnItem,
    TransactionType,
    User,
)
from app.schemas.sales import OrderCreate, OrderItemOut, OrderOut, OrderSummaryOut, PaymentOut
from app.services import audit_service, code_gen, inventory_ops, settings_service
from app.services.pricing import allocate_discount, discount_percent, order_discount, round_money
from app.utils.pagination import apply_sort, paginate
from app.utils.time import utcnow, vn_date_of, vn_day_range, vn_today

SORTABLE_FIELDS = {
    "code": SalesOrder.code,
    "created_at": SalesOrder.created_at,
    "total_amount": SalesOrder.total_amount,
}


def _field_error(field: str, message: str) -> AppError:
    return AppError("VALIDATION_ERROR", "Dữ liệu không hợp lệ", 422, [{"field": field, "message": message}])


def request_fingerprint(data: OrderCreate) -> str:
    canonical = json.dumps(data.model_dump(mode="json"), sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(canonical.encode()).hexdigest()


# ---------- Chuyển đổi sang response ----------


def payment_method_of(order: SalesOrder) -> str | None:
    return next((p.method for p in order.payments if p.type == "PAYMENT"), None)


@dataclass(frozen=True)
class Returned:
    """Tổng đã trả của một dòng đơn qua mọi phiếu trả."""

    quantity: int = 0
    refunded: Decimal = Decimal("0")
    restocked_cost: Decimal = Decimal("0")  # giá vốn hàng trả còn bán được (đã nhập lại kho)


def returned_by_item(db: Session, order_ids: list[int]) -> dict[int, Returned]:
    """Một truy vấn cho nhiều đơn: order_item_id → tổng SL đã trả, tiền đã hoàn, giá vốn đã nhập lại."""
    if not order_ids:
        return {}
    restocked = case(
        (
            SalesReturnItem.condition == ItemCondition.RESELLABLE,
            SalesReturnItem.quantity * SalesReturnItem.unit_cost,
        ),
        else_=0,
    )
    rows = db.execute(
        select(
            SalesReturnItem.sales_order_item_id,
            func.sum(SalesReturnItem.quantity),
            func.sum(SalesReturnItem.refund_amount),
            func.sum(restocked),
        )
        .join(SalesReturn, SalesReturn.id == SalesReturnItem.sales_return_id)
        .where(SalesReturn.sales_order_id.in_(order_ids))
        .group_by(SalesReturnItem.sales_order_item_id)
    ).all()
    return {
        item_id: Returned(int(qty), refunded, restocked_cost)
        for item_id, qty, refunded, restocked_cost in rows
    }


def return_status(order: SalesOrder, returned: dict[int, Returned]) -> str:
    sold = sum(item.quantity for item in order.items)
    back = sum(returned.get(item.id, Returned()).quantity for item in order.items)
    if back == 0:
        return "NONE"
    return "FULL" if back >= sold else "PARTIAL"


def to_summary(order: SalesOrder, returned: dict[int, Returned]) -> OrderSummaryOut:
    return OrderSummaryOut(
        id=order.id,
        code=order.code,
        status=order.status,
        return_status=return_status(order, returned),
        customer=order.customer,
        subtotal=order.subtotal,
        discount_amount=order.discount_amount,
        total_amount=order.total_amount,
        item_count=len(order.items),
        payment_method=payment_method_of(order),
        created_by=order.creator,
        created_at=order.created_at,
    )


def order_summaries(db: Session, orders: list[SalesOrder]) -> list[OrderSummaryOut]:
    returned = returned_by_item(db, [o.id for o in orders])
    return [to_summary(o, returned) for o in orders]


def to_out(db: Session, order: SalesOrder, include_cost: bool) -> OrderOut:
    returned = returned_by_item(db, [order.id])
    completed = order.status == OrderStatus.COMPLETED

    items = []
    for item in order.items:
        back = returned.get(item.id, Returned())
        data = {
            "id": item.id,
            "product_id": item.product_id,
            "sku": item.sku,
            "product_name": item.product_name,
            "unit": item.unit,
            "quantity": item.quantity,
            "unit_price": item.unit_price,
            "line_subtotal": item.line_subtotal,
            "discount_allocated": item.discount_allocated,
            "line_total": item.line_total,
            "returned_quantity": back.quantity,
            "returnable_quantity": item.quantity - back.quantity if completed else 0,
        }
        if include_cost:
            data["unit_cost"] = item.unit_cost
        items.append(OrderItemOut.model_validate(data))

    returns = db.scalars(
        select(SalesReturn).where(SalesReturn.sales_order_id == order.id).order_by(SalesReturn.id)
    ).unique()
    data = {
        **to_summary(order, returned).model_dump(),
        "discount_type": order.discount_type,
        "discount_value": order.discount_value,
        "note": order.note,
        "items": items,
        "payments": [PaymentOut.model_validate(p) for p in order.payments],
        "returns": [
            {"id": r.id, "code": r.code, "total_refund": r.total_refund, "created_at": r.created_at}
            for r in returns
        ],
        "cancelled_by": order.canceller
        and {"id": order.canceller.id, "full_name": order.canceller.full_name},
        "cancelled_at": order.cancelled_at,
        "cancel_reason": order.cancel_reason,
    }
    if include_cost:
        if completed:
            # Lợi nhuận gộp = (doanh thu − tiền hoàn) − (giá vốn đã bán − giá vốn hàng trả đã nhập lại kho)
            refunds = sum((b.refunded for b in returned.values()), Decimal("0"))
            restocked = sum((b.restocked_cost for b in returned.values()), Decimal("0"))
            cost = sum((item.quantity * item.unit_cost for item in order.items), Decimal("0"))
            data["gross_profit"] = round_money(order.total_amount - refunds - (cost - restocked))
        else:
            data["gross_profit"] = Decimal("0.00")  # đơn đã hủy: hoàn toàn bộ tiền và hàng
    return OrderOut.model_validate(data)


# ---------- Truy vấn ----------


def get_order(db: Session, order_id: int) -> SalesOrder:
    order = db.get(SalesOrder, order_id)
    if order is None:
        raise AppError("NOT_FOUND", "Không tìm thấy đơn hàng", 404)
    return order


def list_orders(
    db: Session,
    *,
    q: str | None,
    status: str | None,
    customer_id: int | None,
    created_by: int | None,
    payment_method: str | None,
    date_from: date | None,
    date_to: date | None,
    page: int,
    page_size: int,
    sort: str | None,
) -> tuple[list[SalesOrder], int]:
    stmt = select(SalesOrder).outerjoin(Customer, Customer.id == SalesOrder.customer_id)
    if q:
        q = q.strip()
        conditions = [
            SalesOrder.code.icontains(q, autoescape=True),
            Customer.name.icontains(q, autoescape=True),
        ]
        digits = re.sub(r"\D", "", q)
        if len(digits) >= 3:
            conditions.append(Customer.phone.contains(digits))
        stmt = stmt.where(or_(*conditions))
    if status:
        stmt = stmt.where(SalesOrder.status == status.upper())
    if customer_id is not None:
        stmt = stmt.where(SalesOrder.customer_id == customer_id)
    if created_by is not None:
        stmt = stmt.where(SalesOrder.created_by == created_by)
    if payment_method:
        stmt = stmt.where(
            exists().where(
                Payment.sales_order_id == SalesOrder.id,
                Payment.type == "PAYMENT",
                Payment.method == payment_method.upper(),
            )
        )
    start, end = vn_day_range(date_from, date_to)
    if start:
        stmt = stmt.where(SalesOrder.created_at >= start)
    if end:
        stmt = stmt.where(SalesOrder.created_at < end)
    stmt = apply_sort(stmt, sort, SORTABLE_FIELDS, default="-created_at")
    return paginate(db, stmt, page, page_size)


# ---------- Tạo đơn ----------


def _find_by_key(db: Session, key: uuid.UUID) -> SalesOrder | None:
    return db.scalar(select(SalesOrder).where(SalesOrder.idempotency_key == key))


def _replay(existing: SalesOrder, fingerprint: str, actor: User) -> SalesOrder:
    """Cùng key + cùng nội dung + cùng người → trả lại đơn cũ. Khác nội dung/người → xung đột."""
    if existing.request_hash != fingerprint or existing.created_by != actor.id:
        raise AppError(
            "IDEMPOTENCY_CONFLICT",
            "Idempotency-Key đã được dùng cho một đơn hàng khác",
            409,
            {"order_id": existing.id},
        )
    return existing


def create_order(
    db: Session, data: OrderCreate, key: uuid.UUID, actor: User, ip: str | None
) -> tuple[SalesOrder, bool]:
    """Trả về (đơn hàng, True nếu vừa tạo mới / False nếu là đơn đã tạo trước đó với cùng key)."""
    fingerprint = request_fingerprint(data)

    # 1. Request gửi lại (bấm 2 lần, mạng chập chờn) → trả đúng đơn đã tạo, không tạo đơn mới
    existing = _find_by_key(db, key)
    if existing is not None:
        return _replay(existing, fingerprint, actor), False

    # 2. Kiểm tra khách hàng, sản phẩm và tính tiền từ giá trong DB (không tin số tiền từ client)
    if data.customer_id is not None:
        customer = db.get(Customer, data.customer_id)
        if customer is None or not customer.is_active:
            raise _field_error("customer_id", "Khách hàng không tồn tại hoặc đã ngừng sử dụng")

    product_ids = [item.product_id for item in data.items]
    products = {p.id: p for p in db.scalars(select(Product).where(Product.id.in_(product_ids))).unique()}
    inactive = []
    for index, item in enumerate(data.items):
        product = products.get(item.product_id)
        if product is None:
            raise _field_error(f"items.{index}.product_id", "Sản phẩm không tồn tại")
        if not product.is_active:
            inactive.append(product.sku)
    if inactive:
        raise AppError("PRODUCT_INACTIVE", "Có sản phẩm đã ngừng kinh doanh", 409, {"skus": inactive})

    line_subtotals = [products[item.product_id].sale_price * item.quantity for item in data.items]
    subtotal = sum(line_subtotals, Decimal("0"))
    discount_type = data.discount.type if data.discount else None
    discount_value = data.discount.value if data.discount else Decimal("0")
    discount_amount = order_discount(subtotal, discount_type, discount_value)
    total = subtotal - discount_amount

    limit = settings_service.max_discount_percent(db, actor.role.code)
    if limit is not None and discount_percent(subtotal, discount_amount) > limit:
        max_percent = format(limit.normalize(), "f")  # "10" thay vì "1E+1"
        raise AppError(
            "DISCOUNT_EXCEEDS_LIMIT",
            f"Bạn chỉ được giảm tối đa {max_percent}% giá trị đơn",
            403,
            {"max_percent": max_percent},
        )

    payment = data.payment
    if payment.method == PaymentMethod.CASH and payment.cash_received < total:
        raise AppError(
            "INSUFFICIENT_PAYMENT",
            "Tiền khách đưa chưa đủ",
            422,
            {"total_amount": str(total), "cash_received": str(payment.cash_received)},
        )

    # 3. Khóa tồn kho (thứ tự product_id tăng dần). Từ đây đến lúc commit, không ai khác bán được các sản phẩm này.
    inventories = inventory_ops.lock_inventory(db, product_ids)

    # 4. Kiểm tra key lần nữa SAU khi có khóa: nếu một request trùng key vừa commit trong lúc ta chờ khóa,
    #    trả về đơn đó thay vì báo "hết hàng" (vì chính đơn đó đã mua món hàng cuối cùng)
    existing = _find_by_key(db, key)
    if existing is not None:
        return _replay(existing, fingerprint, actor), False

    shortages = [
        {
            "product_id": item.product_id,
            "sku": products[item.product_id].sku,
            "requested": item.quantity,
            "available": inventories[item.product_id].quantity,
        }
        for item in data.items
        if inventories[item.product_id].quantity < item.quantity
    ]
    if shortages:
        db.rollback()
        raise AppError("OUT_OF_STOCK", "Không đủ hàng trong kho", 409, shortages)

    # 5. Tạo đơn, dòng hàng (lưu giá bán + giá vốn tại thời điểm bán), trừ kho, ghi thanh toán
    order = SalesOrder(
        code=code_gen.document_code(db, "HD", vn_today()),
        idempotency_key=key,
        request_hash=fingerprint,
        customer_id=data.customer_id,
        status=OrderStatus.COMPLETED,
        subtotal=subtotal,
        discount_type=discount_type,
        discount_value=discount_value,
        discount_amount=discount_amount,
        total_amount=total,
        note=data.note,
        created_by=actor.id,
    )
    for item, line_subtotal, allocated in zip(
        data.items, line_subtotals, allocate_discount(line_subtotals, discount_amount), strict=True
    ):
        product = products[item.product_id]
        order.items.append(
            SalesOrderItem(
                product_id=product.id,
                product_name=product.name,
                sku=product.sku,
                unit=product.unit,
                quantity=item.quantity,
                unit_price=product.sale_price,
                line_subtotal=line_subtotal,
                discount_allocated=allocated,
                line_total=line_subtotal - allocated,
                unit_cost=inventories[product.id].avg_cost,
            )
        )
    if total > 0:  # đơn giảm 100% không phát sinh dòng tiền
        is_cash = payment.method == PaymentMethod.CASH
        order.payments.append(
            Payment(
                type="PAYMENT",
                method=payment.method,
                amount=total,
                cash_received=payment.cash_received if is_cash else None,
                change_amount=payment.cash_received - total if is_cash else None,
                reference_note=payment.reference_note,
                created_by=actor.id,
            )
        )
    db.add(order)
    try:
        db.flush()
    except IntegrityError:
        # Hai request cùng key lọt qua cùng lúc: unique index chặn request sau → trả về đơn của request trước
        db.rollback()
        existing = _find_by_key(db, key)
        if existing is None:
            raise
        return _replay(existing, fingerprint, actor), False

    for item in data.items:
        inventory_ops.issue(
            db,
            inventories[item.product_id],
            item.quantity,
            tx_type=TransactionType.SALE,
            reference_type="sales_order",
            reference_id=order.id,
            actor_id=actor.id,
        )

    audit_service.record(
        db,
        action="ORDER_CREATE",
        user_id=actor.id,
        entity_type="sales_order",
        entity_id=order.id,
        new_values={"code": order.code, "total_amount": total, "discount_amount": discount_amount},
        ip_address=ip,
    )
    db.commit()
    db.expire_all()
    return get_order(db, order.id), True


# ---------- Hủy đơn ----------


def lock_order(db: Session, order_id: int) -> SalesOrder:
    """Khóa dòng đơn hàng: hủy đơn và các phiếu trả của cùng một đơn sẽ chạy lần lượt, không chồng lên nhau."""
    order = db.scalar(
        select(SalesOrder)
        .where(SalesOrder.id == order_id)
        .with_for_update(of=SalesOrder)
        .execution_options(populate_existing=True)
    )
    if order is None:
        raise AppError("NOT_FOUND", "Không tìm thấy đơn hàng", 404)
    return order


def cancel_order(db: Session, order_id: int, reason: str, actor: User, ip: str | None) -> SalesOrder:
    """
    Hủy đơn: hoàn toàn bộ hàng về kho (theo giá vốn lúc bán) và hoàn toàn bộ tiền.
    Chỉ trong cùng ngày bán và khi chưa có phiếu trả — để báo cáo các ngày đã chốt không bị thay đổi
    và để không phải tách phần đã trả / chưa trả.
    """
    order = lock_order(db, order_id)
    if order.status != OrderStatus.COMPLETED:
        raise AppError("INVALID_STATE", "Đơn hàng đã được hủy trước đó", 409, {"status": order.status})
    if db.scalar(select(SalesReturn.id).where(SalesReturn.sales_order_id == order.id).limit(1)) is not None:
        raise AppError(
            "CANCEL_NOT_ALLOWED", "Đơn đã có phiếu trả hàng, không thể hủy", 409, {"reason": "HAS_RETURNS"}
        )
    if vn_date_of(order.created_at) != vn_today():
        raise AppError(
            "CANCEL_NOT_ALLOWED",
            "Chỉ hủy được đơn trong ngày bán. Đơn của ngày trước hãy xử lý bằng trả hàng",
            409,
            {"reason": "NOT_SAME_DAY"},
        )

    now = utcnow()
    order.status = OrderStatus.CANCELLED
    order.cancelled_by = actor.id
    order.cancelled_at = now
    order.cancel_reason = reason

    inventories = inventory_ops.lock_inventory(db, (item.product_id for item in order.items))
    for item in order.items:
        inventory_ops.receive(
            db,
            inventories[item.product_id],
            item.quantity,
            item.unit_cost,
            tx_type=TransactionType.ORDER_CANCEL,
            reference_type="sales_order",
            reference_id=order.id,
            actor_id=actor.id,
            note=reason[:255],
        )

    method = payment_method_of(order)
    if order.total_amount > 0 and method is not None:
        order.payments.append(
            Payment(type="REFUND", method=method, amount=order.total_amount, created_by=actor.id)
        )

    audit_service.record(
        db,
        action="ORDER_CANCEL",
        user_id=actor.id,
        entity_type="sales_order",
        entity_id=order.id,
        old_values={"status": OrderStatus.COMPLETED},
        new_values={"status": OrderStatus.CANCELLED, "reason": reason},
        ip_address=ip,
    )
    db.commit()
    db.expire_all()
    return get_order(db, order.id)
