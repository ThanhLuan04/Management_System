"""
Màn hình bếp: mỗi đơn có món ăn là một phiếu; từng dòng món đi Chờ → Đang làm → Xong → Đã giao.

- Khách trả tiền trước ở quầy nên phiếu có ngay khi tạo đơn (dòng món ở trạng thái NEW).
- Đổi trạng thái khóa dòng đơn (FOR UPDATE) — cùng khóa với hủy đơn / trả hàng, nên không có chuyện
  bếp vừa bấm "Xong" đúng lúc thu ngân hủy đơn mà dữ liệu lệch nhau.
- Chỉ cho đi tới hoặc lùi một bước (lùi để sửa bấm nhầm), không nhảy cóc.
"""

from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.models import KitchenStatus, OrderStatus, SalesOrder, SalesOrderItem
from app.schemas.kitchen import KitchenItemOut, KitchenTicketOut
from app.services.sales_service import lock_order
from app.utils.time import utcnow

_STEP = {status: index for index, status in enumerate(KitchenStatus.FLOW)}


def to_ticket(order: SalesOrder) -> KitchenTicketOut:
    return KitchenTicketOut(
        order_id=order.id,
        code=order.code,
        queue_number=order.queue_number,
        service_type=order.service_type,
        table_label=order.table_label,
        note=order.note,
        cancelled=order.status == OrderStatus.CANCELLED,
        cancel_reason=order.cancel_reason,
        cashier=order.creator.full_name,
        created_at=order.created_at,
        items=[
            KitchenItemOut(
                id=item.id,
                product_name=item.product_name,
                unit=item.unit,
                quantity=item.quantity,
                note=item.note,
                kitchen_status=item.kitchen_status,
                kitchen_updated_at=item.kitchen_updated_at,
            )
            for item in sorted(order.items, key=lambda i: i.id)
            if item.kitchen_status is not None
        ],
    )


def list_tickets(db: Session) -> list[SalesOrder]:
    """Phiếu còn món chưa giao (cũ nhất trước) + phiếu bị hủy giữa chừng mà bếp chưa xác nhận."""
    has_active_items = select(SalesOrderItem.sales_order_id).where(
        SalesOrderItem.kitchen_status.in_(KitchenStatus.ACTIVE)
    )
    stmt = (
        select(SalesOrder)
        .where(
            SalesOrder.id.in_(has_active_items),
            or_(
                SalesOrder.status == OrderStatus.COMPLETED,
                and_(SalesOrder.status == OrderStatus.CANCELLED, SalesOrder.kitchen_cancel_ack_at.is_(None)),
            ),
        )
        .order_by(SalesOrder.created_at, SalesOrder.id)
    )
    return list(db.scalars(stmt).unique())


def _ensure_open(order: SalesOrder) -> None:
    if order.status != OrderStatus.COMPLETED:
        raise AppError("ORDER_CANCELLED", "Đơn đã bị hủy — dừng làm các món của đơn này", 409)


def _ensure_step(current: str, target: str) -> None:
    if abs(_STEP[target] - _STEP[current]) != 1:
        raise AppError(
            "INVALID_KITCHEN_TRANSITION",
            "Chỉ chuyển sang bước kế tiếp (hoặc lùi một bước để sửa bấm nhầm)",
            409,
            {"from": current, "to": target},
        )


def set_item_status(db: Session, item_id: int, status: str) -> SalesOrder:
    order_id = db.scalar(select(SalesOrderItem.sales_order_id).where(SalesOrderItem.id == item_id))
    if order_id is None:
        raise AppError("NOT_FOUND", "Không tìm thấy món", 404)
    order = lock_order(db, order_id)
    _ensure_open(order)
    item = next(i for i in order.items if i.id == item_id)
    if item.kitchen_status is None:
        raise AppError("NOT_A_KITCHEN_ITEM", "Hàng hóa không qua bếp", 409)
    _ensure_step(item.kitchen_status, status)
    item.kitchen_status = status
    item.kitchen_updated_at = utcnow()
    db.commit()
    db.expire_all()
    return db.get(SalesOrder, order_id)


def advance_ticket(db: Session, order_id: int, status: str) -> SalesOrder:
    """Cả phiếu: đưa mọi món chưa tới bước `status` lên `status` (món đã đi xa hơn giữ nguyên)."""
    order = lock_order(db, order_id)
    _ensure_open(order)
    kitchen_items = [i for i in order.items if i.kitchen_status is not None]
    if not kitchen_items:
        raise AppError("NOT_A_KITCHEN_ITEM", "Đơn không có món nào qua bếp", 409)
    now = utcnow()
    for item in kitchen_items:
        if _STEP[item.kitchen_status] < _STEP[status]:
            item.kitchen_status = status
            item.kitchen_updated_at = now
    db.commit()
    db.expire_all()
    return db.get(SalesOrder, order_id)


def acknowledge_cancel(db: Session, order_id: int) -> None:
    order = lock_order(db, order_id)
    if order.status != OrderStatus.CANCELLED:
        raise AppError("INVALID_STATE", "Đơn chưa bị hủy", 409)
    if order.kitchen_cancel_ack_at is None:
        order.kitchen_cancel_ack_at = utcnow()
    db.commit()
