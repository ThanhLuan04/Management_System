"""Tra cứu tồn kho, sổ cái kho và nghiệp vụ điều chỉnh / kiểm kê."""

from datetime import date

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.models import (
    AdjustmentType,
    Category,
    Inventory,
    InventoryTransaction,
    Product,
    PurchaseOrder,
    SalesOrder,
    SalesReturn,
    StockAdjustment,
    StockAdjustmentItem,
    TransactionType,
    User,
)
from app.schemas.inventory import (
    AdjustmentCreate,
    AdjustmentItemOut,
    AdjustmentOut,
    AdjustmentSummaryOut,
    InventoryItemOut,
    InventoryTransactionOut,
    ProductStockOut,
)
from app.services import audit_service, code_gen, inventory_ops
from app.services.pricing import round_money
from app.services.product_service import get_product, search_condition
from app.utils.pagination import apply_sort, paginate
from app.utils.time import vn_day_range, vn_today

INVENTORY_SORT = {
    "name": Product.name,
    "sku": Product.sku,
    "quantity": Inventory.quantity,
    "stock_value": Inventory.quantity * Inventory.avg_cost,
}

# Bảng chứa mã chứng từ theo reference_type — mọi reference_type mà inventory_ops ghi ra đều phải có ở đây
# (test_every_ledger_reference_type_resolves_to_a_code kiểm tra điều này)
REFERENCE_MODELS = {
    "purchase_order": PurchaseOrder,
    "sales_order": SalesOrder,
    "sales_return": SalesReturn,
    "stock_adjustment": StockAdjustment,
}


# ---------- Tồn kho ----------


def list_inventory(
    db: Session,
    *,
    q: str | None,
    category_id: int | None,
    is_active: bool | None,
    low_stock: bool | None,
    out_of_stock: bool | None,
    page: int,
    page_size: int,
    sort: str | None,
    include_cost: bool,
) -> tuple[list[InventoryItemOut], int]:
    stmt = select(Product).join(Inventory, Inventory.product_id == Product.id)
    if q:
        stmt = stmt.where(search_condition(q))
    if category_id is not None:
        child_ids = select(Category.id).where(
            or_(Category.id == category_id, Category.parent_id == category_id)
        )
        stmt = stmt.where(Product.category_id.in_(child_ids))
    if is_active is not None:
        stmt = stmt.where(Product.is_active.is_(is_active))
    if low_stock:
        stmt = stmt.where(Product.is_active.is_(True), Inventory.quantity <= Product.min_stock)
    if out_of_stock:
        stmt = stmt.where(Inventory.quantity == 0)
    if not include_cost and sort and sort.lstrip("-") == "stock_value":
        sort = None  # không cho dò giá vốn gián tiếp qua thứ tự sắp xếp
    stmt = apply_sort(stmt, sort, INVENTORY_SORT, default="name")
    products, total = paginate(db, stmt, page, page_size)

    items = []
    for product in products:
        inv = product.inventory
        data = {
            "product_id": product.id,
            "sku": product.sku,
            "name": product.name,
            "unit": product.unit,
            "category_name": product.category.name,
            "is_active": product.is_active,
            "quantity": inv.quantity,
            "min_stock": product.min_stock,
            "is_low_stock": product.is_active and inv.quantity <= product.min_stock,
        }
        if include_cost:
            data["avg_cost"] = inv.avg_cost
            data["stock_value"] = round_money(inv.quantity * inv.avg_cost)
        items.append(InventoryItemOut.model_validate(data))
    return items, total


# ---------- Sổ cái kho ----------


def _reference_codes(db: Session, transactions: list[InventoryTransaction]) -> dict[tuple[str, int], str]:
    wanted: dict[str, set[int]] = {}
    for tx in transactions:
        wanted.setdefault(tx.reference_type, set()).add(tx.reference_id)
    codes: dict[tuple[str, int], str] = {}
    for ref_type, ids in wanted.items():
        model = REFERENCE_MODELS.get(ref_type)
        if model is None:
            continue
        for ref_id, code in db.execute(select(model.id, model.code).where(model.id.in_(ids))):
            codes[(ref_type, ref_id)] = code
    return codes


def to_transaction_outs(
    db: Session, transactions: list[InventoryTransaction], include_cost: bool
) -> list[InventoryTransactionOut]:
    codes = _reference_codes(db, transactions)
    result = []
    for tx in transactions:
        data = {
            "id": tx.id,
            "product_id": tx.product_id,
            "sku": tx.product.sku,
            "product_name": tx.product.name,
            "type": tx.type,
            "quantity_change": tx.quantity_change,
            "quantity_after": tx.quantity_after,
            "reference_type": tx.reference_type,
            "reference_id": tx.reference_id,
            "reference_code": codes.get((tx.reference_type, tx.reference_id)),
            "note": tx.note,
            "created_by": {"id": tx.creator.id, "full_name": tx.creator.full_name},
            "created_at": tx.created_at,
        }
        if include_cost:
            data["unit_cost"] = tx.unit_cost
            data["avg_cost_after"] = tx.avg_cost_after
        result.append(InventoryTransactionOut.model_validate(data))
    return result


def list_transactions(
    db: Session,
    *,
    product_id: int | None,
    tx_type: str | None,
    date_from: date | None,
    date_to: date | None,
    page: int,
    page_size: int,
    include_cost: bool,
) -> tuple[list[InventoryTransactionOut], int]:
    stmt = select(InventoryTransaction)
    if product_id is not None:
        stmt = stmt.where(InventoryTransaction.product_id == product_id)
    if tx_type:
        if tx_type.upper() not in TransactionType.ALL:
            raise AppError(
                "VALIDATION_ERROR",
                "Dữ liệu không hợp lệ",
                422,
                [{"field": "type", "message": f"Chỉ chấp nhận: {', '.join(TransactionType.ALL)}"}],
            )
        stmt = stmt.where(InventoryTransaction.type == tx_type.upper())
    start, end = vn_day_range(date_from, date_to)
    if start:
        stmt = stmt.where(InventoryTransaction.created_at >= start)
    if end:
        stmt = stmt.where(InventoryTransaction.created_at < end)
    # Mới nhất trước; id phá hòa khi nhiều dòng cùng thời điểm (cùng một transaction)
    stmt = stmt.order_by(InventoryTransaction.created_at.desc(), InventoryTransaction.id.desc())
    transactions, total = paginate(db, stmt, page, page_size)
    return to_transaction_outs(db, transactions, include_cost), total


def product_stock(db: Session, product_id: int, include_cost: bool, limit: int = 20) -> ProductStockOut:
    product = get_product(db, product_id)
    recent = list(
        db.scalars(
            select(InventoryTransaction)
            .where(InventoryTransaction.product_id == product_id)
            .order_by(InventoryTransaction.created_at.desc(), InventoryTransaction.id.desc())
            .limit(limit)
        ).unique()
    )
    data = {
        "product_id": product.id,
        "sku": product.sku,
        "name": product.name,
        "unit": product.unit,
        "quantity": product.inventory.quantity,
        "min_stock": product.min_stock,
        "is_low_stock": product.is_active and product.inventory.quantity <= product.min_stock,
        "recent_transactions": to_transaction_outs(db, recent, include_cost),
    }
    if include_cost:
        data["avg_cost"] = product.inventory.avg_cost
    return ProductStockOut.model_validate(data)


# ---------- Điều chỉnh / kiểm kê ----------


def adjustment_summary(adjustment: StockAdjustment) -> AdjustmentSummaryOut:
    return AdjustmentSummaryOut(
        id=adjustment.id,
        code=adjustment.code,
        type=adjustment.type,
        reason=adjustment.reason,
        note=adjustment.note,
        item_count=len(adjustment.items),
        created_by=adjustment.creator,
        created_at=adjustment.created_at,
    )


def adjustment_out(adjustment: StockAdjustment, include_cost: bool) -> AdjustmentOut:
    items = []
    for item in adjustment.items:
        data = {
            "id": item.id,
            "product_id": item.product_id,
            "sku": item.product.sku,
            "product_name": item.product.name,
            "quantity_before": item.quantity_before,
            "quantity_change": item.quantity_change,
            "counted_quantity": item.counted_quantity,
        }
        if include_cost:
            data["unit_cost"] = item.unit_cost
        items.append(AdjustmentItemOut.model_validate(data))
    return AdjustmentOut(**adjustment_summary(adjustment).model_dump(), items=items)


def get_adjustment(db: Session, adjustment_id: int) -> StockAdjustment:
    adjustment = db.get(StockAdjustment, adjustment_id)
    if adjustment is None:
        raise AppError("NOT_FOUND", "Không tìm thấy phiếu điều chỉnh", 404)
    return adjustment


def list_adjustments(
    db: Session,
    *,
    adj_type: str | None,
    date_from: date | None,
    date_to: date | None,
    page: int,
    page_size: int,
) -> tuple[list[StockAdjustment], int]:
    stmt = select(StockAdjustment)
    if adj_type:
        stmt = stmt.where(StockAdjustment.type == adj_type.upper())
    start, end = vn_day_range(date_from, date_to)
    if start:
        stmt = stmt.where(StockAdjustment.created_at >= start)
    if end:
        stmt = stmt.where(StockAdjustment.created_at < end)
    stmt = stmt.order_by(StockAdjustment.created_at.desc(), StockAdjustment.id.desc())
    return paginate(db, stmt, page, page_size)


def create_adjustment(db: Session, data: AdjustmentCreate, actor: User, ip: str | None) -> StockAdjustment:
    product_ids = [item.product_id for item in data.items]
    inventories = inventory_ops.lock_inventory(db, product_ids)

    # Tính chênh lệch theo tồn ĐÃ KHÓA (không ai đổi được tồn trong lúc này)
    planned: list[tuple[int, int, int | None]] = []  # (product_id, change, counted)
    for item in data.items:
        on_hand = inventories[item.product_id].quantity
        if data.type == AdjustmentType.STOCKTAKE:
            change = item.counted_quantity - on_hand
            if change == 0:
                continue  # kiểm kê khớp sổ → không cần ghi dòng điều chỉnh
        else:
            change = item.quantity_change
        planned.append((item.product_id, change, item.counted_quantity))

    if not planned:
        db.rollback()
        raise AppError(
            "VALIDATION_ERROR",
            "Dữ liệu không hợp lệ",
            422,
            [{"field": "items", "message": "Số lượng kiểm kê khớp với tồn kho, không có gì cần điều chỉnh"}],
        )

    adjustment = StockAdjustment(
        code=code_gen.document_code(db, "DC", vn_today()),
        type=data.type,
        reason=data.reason,
        note=data.note,
        created_by=actor.id,
    )
    db.add(adjustment)
    db.flush()

    for product_id, change, counted in planned:
        inventory = inventories[product_id]
        before = inventory.quantity
        tx_args = {
            "tx_type": TransactionType.ADJUSTMENT,
            "reference_type": "stock_adjustment",
            "reference_id": adjustment.id,
            "actor_id": actor.id,
            "note": data.reason[:255],
        }
        if change > 0:
            # Hàng thừa được ghi nhận theo giá vốn bình quân hiện tại → giá vốn bình quân không đổi
            tx = inventory_ops.receive(db, inventory, change, inventory.avg_cost, **tx_args)
        else:
            tx = inventory_ops.issue(db, inventory, -change, error_code="NEGATIVE_STOCK", **tx_args)
        adjustment.items.append(
            StockAdjustmentItem(
                product_id=product_id,
                quantity_before=before,
                quantity_change=change,
                counted_quantity=counted,
                unit_cost=tx.unit_cost,
            )
        )

    audit_service.record(
        db,
        action="STOCK_ADJUSTMENT_CREATE",
        user_id=actor.id,
        entity_type="stock_adjustment",
        entity_id=adjustment.id,
        new_values={"code": adjustment.code, "type": data.type, "reason": data.reason, "items": len(planned)},
        ip_address=ip,
    )
    db.commit()
    db.expire_all()
    return get_adjustment(db, adjustment.id)
