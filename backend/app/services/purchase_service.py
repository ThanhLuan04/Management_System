"""Nghiệp vụ phiếu nhập: nháp → xác nhận (cộng kho) hoặc hủy nháp."""

from datetime import date
from decimal import Decimal

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.models import (
    Product,
    PurchaseOrder,
    PurchaseOrderItem,
    PurchaseStatus,
    Supplier,
    TransactionType,
    User,
)
from app.schemas.purchase import PurchaseCreate, PurchaseItemOut, PurchaseOut, PurchaseSummaryOut
from app.services import audit_service, code_gen, inventory_ops
from app.services.pricing import effective_unit_cost, purchase_line_total
from app.utils.pagination import apply_sort, paginate
from app.utils.time import utcnow, vn_day_range, vn_today

SORTABLE_FIELDS = {
    "code": PurchaseOrder.code,
    "created_at": PurchaseOrder.created_at,
    "total_amount": PurchaseOrder.total_amount,
}


def _field_error(field: str, message: str) -> AppError:
    return AppError("VALIDATION_ERROR", "Dữ liệu không hợp lệ", 422, [{"field": field, "message": message}])


# ---------- Chuyển đổi sang response ----------


def to_summary(order: PurchaseOrder) -> PurchaseSummaryOut:
    return PurchaseSummaryOut(
        id=order.id,
        code=order.code,
        status=order.status,
        supplier=order.supplier,
        total_amount=order.total_amount,
        item_count=len(order.items),
        note=order.note,
        created_by=order.creator,
        confirmed_by=order.confirmer,
        confirmed_at=order.confirmed_at,
        cancelled_at=order.cancelled_at,
        created_at=order.created_at,
        updated_at=order.updated_at,
    )


def to_out(order: PurchaseOrder) -> PurchaseOut:
    return PurchaseOut(
        **to_summary(order).model_dump(),
        items=[
            PurchaseItemOut(
                id=item.id,
                product_id=item.product_id,
                sku=item.product.sku,
                product_name=item.product.name,
                unit=item.product.unit,
                quantity=item.quantity,
                unit_cost=item.unit_cost,
                discount_amount=item.discount_amount,
                line_total=item.line_total,
            )
            for item in order.items
        ],
    )


# ---------- Truy vấn ----------


def list_purchases(
    db: Session,
    *,
    q: str | None,
    supplier_id: int | None,
    status: str | None,
    date_from: date | None,
    date_to: date | None,
    page: int,
    page_size: int,
    sort: str | None,
) -> tuple[list[PurchaseOrder], int]:
    stmt = select(PurchaseOrder)
    if q:
        stmt = stmt.where(PurchaseOrder.code.icontains(q.strip(), autoescape=True))
    if supplier_id is not None:
        stmt = stmt.where(PurchaseOrder.supplier_id == supplier_id)
    if status:
        stmt = stmt.where(PurchaseOrder.status == status.upper())
    start, end = vn_day_range(date_from, date_to)
    if start:
        stmt = stmt.where(PurchaseOrder.created_at >= start)
    if end:
        stmt = stmt.where(PurchaseOrder.created_at < end)
    stmt = apply_sort(stmt, sort, SORTABLE_FIELDS, default="-created_at")
    return paginate(db, stmt, page, page_size)


def get_purchase(db: Session, purchase_id: int, *, for_update: bool = False) -> PurchaseOrder:
    stmt = select(PurchaseOrder).where(PurchaseOrder.id == purchase_id)
    if for_update:
        stmt = stmt.with_for_update(of=PurchaseOrder)
    order = db.scalar(stmt)
    if order is None:
        raise AppError("NOT_FOUND", "Không tìm thấy phiếu nhập", 404)
    return order


# ---------- Tạo / sửa nháp ----------


def _validate_and_build_items(db: Session, data: PurchaseCreate) -> tuple[list[PurchaseOrderItem], Decimal]:
    supplier = db.get(Supplier, data.supplier_id)
    if supplier is None or not supplier.is_active:
        raise _field_error("supplier_id", "Nhà cung cấp không tồn tại hoặc đã ngừng hợp tác")

    product_ids = [item.product_id for item in data.items]
    products = {p.id: p for p in db.scalars(select(Product).where(Product.id.in_(product_ids))).unique()}

    items: list[PurchaseOrderItem] = []
    for index, item in enumerate(data.items):
        product = products.get(item.product_id)
        if product is None or not product.is_active:
            raise _field_error(f"items.{index}.product_id", "Sản phẩm không tồn tại hoặc đã ngừng kinh doanh")
        if item.discount_amount > item.quantity * item.unit_cost:
            raise _field_error(f"items.{index}.discount_amount", "Chiết khấu không được lớn hơn thành tiền")
        items.append(
            PurchaseOrderItem(
                product_id=item.product_id,
                quantity=item.quantity,
                unit_cost=item.unit_cost,
                discount_amount=item.discount_amount,
                line_total=purchase_line_total(item.quantity, item.unit_cost, item.discount_amount),
            )
        )
    return items, sum((i.line_total for i in items), Decimal("0"))


def create_purchase(db: Session, data: PurchaseCreate, actor: User, ip: str | None) -> PurchaseOrder:
    items, total = _validate_and_build_items(db, data)
    order = PurchaseOrder(
        code=code_gen.document_code(db, "PN", vn_today()),
        supplier_id=data.supplier_id,
        status=PurchaseStatus.DRAFT,
        total_amount=total,
        note=data.note,
        created_by=actor.id,
        items=items,
    )
    db.add(order)
    db.flush()
    audit_service.record(
        db,
        action="PURCHASE_CREATE",
        user_id=actor.id,
        entity_type="purchase_order",
        entity_id=order.id,
        new_values={
            "code": order.code,
            "supplier_id": order.supplier_id,
            "total_amount": total,
            "items": len(items),
        },
        ip_address=ip,
    )
    db.commit()
    return get_purchase(db, order.id)


def _ensure_draft(order: PurchaseOrder) -> None:
    if order.status != PurchaseStatus.DRAFT:
        raise AppError(
            "INVALID_STATE",
            "Chỉ thao tác được với phiếu nhập đang ở trạng thái nháp",
            409,
            {"status": order.status},
        )


def replace_purchase(
    db: Session, purchase_id: int, data: PurchaseCreate, actor: User, ip: str | None
) -> PurchaseOrder:
    order = get_purchase(
        db, purchase_id, for_update=True
    )  # khóa để không sửa trong lúc người khác đang xác nhận
    _ensure_draft(order)
    items, total = _validate_and_build_items(db, data)

    old_total = order.total_amount
    order.items.clear()
    db.flush()  # xóa dòng cũ trước khi thêm dòng mới (tránh vi phạm unique (phiếu, sản phẩm))
    order.items.extend(items)
    order.supplier_id = data.supplier_id
    order.note = data.note
    order.total_amount = total
    audit_service.record(
        db,
        action="PURCHASE_UPDATE",
        user_id=actor.id,
        entity_type="purchase_order",
        entity_id=order.id,
        old_values={"total_amount": old_total},
        new_values={"total_amount": total, "items": len(items)},
        ip_address=ip,
    )
    db.commit()
    db.expire_all()
    return get_purchase(db, order.id)


# ---------- Xác nhận / hủy ----------


def _transition(db: Session, purchase_id: int, values: dict) -> None:
    """
    Đổi trạng thái DRAFT → khác bằng một câu UPDATE có điều kiện.
    Hai request xác nhận cùng lúc: PostgreSQL chỉ cho một câu UPDATE thắng, câu còn lại thấy status
    đã khác DRAFT → 0 dòng → báo lỗi. Nhờ vậy phiếu không bao giờ được cộng kho hai lần.
    """
    result = db.execute(
        update(PurchaseOrder)
        .where(PurchaseOrder.id == purchase_id, PurchaseOrder.status == PurchaseStatus.DRAFT)
        .values(**values)
        .returning(PurchaseOrder.id)
    )
    if result.scalar_one_or_none() is None:
        current = db.scalar(select(PurchaseOrder.status).where(PurchaseOrder.id == purchase_id))
        db.rollback()
        if current is None:
            raise AppError("NOT_FOUND", "Không tìm thấy phiếu nhập", 404)
        raise AppError("INVALID_STATE", "Phiếu nhập không còn ở trạng thái nháp", 409, {"status": current})


def confirm_purchase(db: Session, purchase_id: int, actor: User, ip: str | None) -> PurchaseOrder:
    now = utcnow()
    _transition(
        db, purchase_id, {"status": PurchaseStatus.CONFIRMED, "confirmed_by": actor.id, "confirmed_at": now}
    )

    items = (
        db.scalars(select(PurchaseOrderItem).where(PurchaseOrderItem.purchase_order_id == purchase_id))
        .unique()
        .all()
    )
    inactive = [item.product.sku for item in items if not item.product.is_active]
    if inactive:
        db.rollback()  # phiếu quay lại DRAFT, kho không đổi
        raise AppError(
            "PRODUCT_INACTIVE",
            "Phiếu có sản phẩm đã ngừng kinh doanh, hãy sửa phiếu trước",
            409,
            {"skus": inactive},
        )

    inventories = inventory_ops.lock_inventory(db, (item.product_id for item in items))
    for item in items:
        inventory_ops.receive(
            db,
            inventories[item.product_id],
            item.quantity,
            effective_unit_cost(item.line_total, item.quantity),
            tx_type=TransactionType.PURCHASE,
            reference_type="purchase_order",
            reference_id=purchase_id,
            actor_id=actor.id,
        )

    audit_service.record(
        db,
        action="PURCHASE_CONFIRM",
        user_id=actor.id,
        entity_type="purchase_order",
        entity_id=purchase_id,
        ip_address=ip,
    )
    db.commit()
    db.expire_all()
    return get_purchase(db, purchase_id)


def cancel_purchase(db: Session, purchase_id: int, actor: User, ip: str | None) -> PurchaseOrder:
    _transition(
        db,
        purchase_id,
        {"status": PurchaseStatus.CANCELLED, "cancelled_by": actor.id, "cancelled_at": utcnow()},
    )
    audit_service.record(
        db,
        action="PURCHASE_CANCEL",
        user_id=actor.id,
        entity_type="purchase_order",
        entity_id=purchase_id,
        ip_address=ip,
    )
    db.commit()
    db.expire_all()
    return get_purchase(db, purchase_id)
