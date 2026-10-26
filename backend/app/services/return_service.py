"""
Trả hàng: hoàn tiền theo giá sau giảm của từng dòng, nhập lại kho hàng còn bán được — tất cả trong một transaction.

Khóa dòng đơn gốc (FOR UPDATE) trong suốt quá trình: hai phiếu trả cho cùng một đơn đến cùng lúc sẽ chạy lần lượt,
phiếu sau thấy số đã trả của phiếu trước → không thể cùng nhau trả vượt số lượng đã bán.
"""

import hashlib
import json
import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.models import (
    Customer,
    ItemCondition,
    OrderStatus,
    Payment,
    SalesOrder,
    SalesReturn,
    SalesReturnItem,
    TransactionType,
    User,
)
from app.schemas.sales import ReturnCreate, ReturnItemOut, ReturnOut, ReturnSummaryOut
from app.services import audit_service, code_gen, inventory_ops, settings_service
from app.services.pricing import line_refund
from app.services.sales_service import Returned, lock_order, payment_method_of, returned_by_item
from app.utils.pagination import paginate
from app.utils.time import vn_date_of, vn_day_range, vn_today


def _fingerprint(data: ReturnCreate) -> str:
    canonical = json.dumps(data.model_dump(mode="json"), sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(canonical.encode()).hexdigest()


# ---------- Response ----------


def _refund_method(sales_return: SalesReturn) -> str | None:
    return next((p.method for p in sales_return.refunds), None)


def to_summary(sales_return: SalesReturn) -> ReturnSummaryOut:
    order = sales_return.order
    return ReturnSummaryOut(
        id=sales_return.id,
        code=sales_return.code,
        order={"id": order.id, "code": order.code},
        customer=order.customer,
        reason=sales_return.reason,
        total_refund=sales_return.total_refund,
        refund_method=_refund_method(sales_return),
        item_count=len(sales_return.items),
        created_by=sales_return.creator,
        created_at=sales_return.created_at,
    )


def to_out(sales_return: SalesReturn, include_cost: bool) -> ReturnOut:
    items = []
    for item in sales_return.items:
        data = {
            "id": item.id,
            "order_item_id": item.sales_order_item_id,
            "product_id": item.product_id,
            "sku": item.order_item.sku,
            "product_name": item.order_item.product_name,
            "quantity": item.quantity,
            "condition": item.condition,
            "refund_amount": item.refund_amount,
        }
        if include_cost:
            data["unit_cost"] = item.unit_cost
        items.append(ReturnItemOut.model_validate(data))
    return ReturnOut(**to_summary(sales_return).model_dump(), items=items)


# ---------- Truy vấn ----------


def get_return(db: Session, return_id: int) -> SalesReturn:
    sales_return = db.get(SalesReturn, return_id)
    if sales_return is None:
        raise AppError("NOT_FOUND", "Không tìm thấy phiếu trả hàng", 404)
    return sales_return


def list_returns(
    db: Session,
    *,
    q: str | None,
    order_id: int | None,
    date_from: date | None,
    date_to: date | None,
    page: int,
    page_size: int,
) -> tuple[list[SalesReturn], int]:
    stmt = (
        select(SalesReturn)
        .join(SalesOrder, SalesOrder.id == SalesReturn.sales_order_id)
        .outerjoin(Customer, Customer.id == SalesOrder.customer_id)
    )
    if q:
        q = q.strip()
        stmt = stmt.where(
            or_(
                SalesReturn.code.icontains(q, autoescape=True),
                SalesOrder.code.icontains(q, autoescape=True),
                Customer.name.icontains(q, autoescape=True),
            )
        )
    if order_id is not None:
        stmt = stmt.where(SalesReturn.sales_order_id == order_id)
    start, end = vn_day_range(date_from, date_to)
    if start:
        stmt = stmt.where(SalesReturn.created_at >= start)
    if end:
        stmt = stmt.where(SalesReturn.created_at < end)
    stmt = stmt.order_by(SalesReturn.created_at.desc(), SalesReturn.id.desc())
    return paginate(db, stmt, page, page_size)


# ---------- Tạo phiếu trả ----------


def _find_by_key(db: Session, key: uuid.UUID) -> SalesReturn | None:
    return db.scalar(select(SalesReturn).where(SalesReturn.idempotency_key == key))


def _replay(existing: SalesReturn, order_id: int, fingerprint: str, actor: User) -> SalesReturn:
    if (
        existing.request_hash != fingerprint
        or existing.created_by != actor.id
        or existing.sales_order_id != order_id
    ):
        raise AppError(
            "IDEMPOTENCY_CONFLICT",
            "Idempotency-Key đã được dùng cho một phiếu trả khác",
            409,
            {"return_id": existing.id},
        )
    return existing


def create_return(
    db: Session, order_id: int, data: ReturnCreate, key: uuid.UUID, actor: User, ip: str | None
) -> tuple[SalesReturn, bool]:
    fingerprint = _fingerprint(data)
    existing = _find_by_key(db, key)
    if existing is not None:
        return _replay(existing, order_id, fingerprint, actor), False

    order = lock_order(db, order_id)
    existing = _find_by_key(db, key)  # request trùng key có thể vừa commit trong lúc ta chờ khóa
    if existing is not None:
        return _replay(existing, order_id, fingerprint, actor), False

    if order.status != OrderStatus.COMPLETED:
        raise AppError("INVALID_STATE", "Đơn hàng đã hủy, không thể trả hàng", 409, {"status": order.status})

    window = int(settings_service.get_value(db, "return_window_days"))
    days_since_sale = (vn_today() - vn_date_of(order.created_at)).days
    if days_since_sale > window:
        raise AppError(
            "RETURN_PERIOD_EXPIRED",
            f"Đã quá thời hạn đổi trả {window} ngày",
            409,
            {"days_since_sale": days_since_sale, "return_window_days": window},
        )

    order_items = {item.id: item for item in order.items}
    returned = returned_by_item(db, [order.id])
    exceeded = []
    planned: list[tuple] = []
    for index, req in enumerate(data.items):
        item = order_items.get(req.order_item_id)
        if item is None:
            raise AppError(
                "VALIDATION_ERROR",
                "Dữ liệu không hợp lệ",
                422,
                [{"field": f"items.{index}.order_item_id", "message": "Dòng hàng không thuộc đơn này"}],
            )
        back = returned.get(item.id, Returned())
        returnable = item.quantity - back.quantity
        if req.quantity > returnable:
            exceeded.append(
                {
                    "order_item_id": item.id,
                    "sku": item.sku,
                    "requested": req.quantity,
                    "returnable": returnable,
                }
            )
            continue
        refund = line_refund(item.line_total, item.quantity, back.quantity, back.refunded, req.quantity)
        planned.append((item, req, refund))
    if exceeded:
        raise AppError(
            "RETURN_QUANTITY_EXCEEDED", "Số lượng trả vượt quá số lượng còn được trả", 409, exceeded
        )

    total_refund = sum((refund for _, _, refund in planned), Decimal("0"))
    sales_return = SalesReturn(
        code=code_gen.document_code(db, "TH", vn_today()),
        idempotency_key=key,
        request_hash=fingerprint,
        sales_order_id=order.id,
        reason=data.reason,
        total_refund=total_refund,
        created_by=actor.id,
        items=[
            SalesReturnItem(
                sales_order_item_id=item.id,
                product_id=item.product_id,
                quantity=req.quantity,
                condition=req.condition,
                refund_amount=refund,
                unit_cost=item.unit_cost,
            )
            for item, req, refund in planned
        ],
    )
    db.add(sales_return)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        existing = _find_by_key(db, key)
        if existing is None:
            raise
        return _replay(existing, order_id, fingerprint, actor), False

    # Hàng còn bán được → nhập lại kho theo giá vốn của dòng đơn gốc (giá vốn bình quân được tính lại)
    resellable = [(item, req) for item, req, _ in planned if req.condition == ItemCondition.RESELLABLE]
    if resellable:
        inventories = inventory_ops.lock_inventory(db, (item.product_id for item, _ in resellable))
        for item, req in resellable:
            inventory_ops.receive(
                db,
                inventories[item.product_id],
                req.quantity,
                item.unit_cost,
                tx_type=TransactionType.SALE_RETURN,
                reference_type="sales_return",
                reference_id=sales_return.id,
                actor_id=actor.id,
            )

    method = payment_method_of(order)
    if total_refund > 0 and method is not None:
        db.add(
            Payment(
                sales_order_id=order.id,
                sales_return_id=sales_return.id,
                type="REFUND",
                method=method,  # MVP: hoàn bằng đúng phương thức khách đã trả
                amount=total_refund,
                created_by=actor.id,
            )
        )

    audit_service.record(
        db,
        action="RETURN_CREATE",
        user_id=actor.id,
        entity_type="sales_return",
        entity_id=sales_return.id,
        new_values={"code": sales_return.code, "order": order.code, "total_refund": total_refund},
        ip_address=ip,
    )
    db.commit()
    db.expire_all()
    return get_return(db, sales_return.id), True
