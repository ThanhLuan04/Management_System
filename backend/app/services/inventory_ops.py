"""
Thao tác tồn kho dùng chung cho mọi nghiệp vụ (nhập, bán, trả, hủy, điều chỉnh).

Quy tắc:
- Luôn gọi lock_inventory() trước khi đổi tồn: khóa các dòng inventory bằng SELECT ... FOR UPDATE,
  theo thứ tự product_id tăng dần — hai transaction cùng đụng sản phẩm X và Y luôn khóa X trước Y → không deadlock.
- Mỗi lần đổi tồn tạo đúng một dòng inventory_transactions (sổ cái kho).
- Không commit ở đây: nghiệp vụ gọi hàm này tự commit một lần, nên lỗi ở bất kỳ bước nào sẽ rollback toàn bộ.
"""

from collections.abc import Iterable
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.models import Inventory, InventoryTransaction
from app.services.pricing import round_cost, weighted_average_cost


def lock_inventory(db: Session, product_ids: Iterable[int]) -> dict[int, Inventory]:
    ids = sorted(set(product_ids))
    rows = db.scalars(
        select(Inventory)
        .where(Inventory.product_id.in_(ids))
        .order_by(Inventory.product_id)
        .with_for_update()
        # BẮT BUỘC: nếu dòng inventory đã được nạp trước đó (ví dụ kèm Product qua lazy="joined"),
        # SQLAlchemy mặc định giữ giá trị CŨ trong bộ nhớ dù câu SELECT FOR UPDATE đọc được giá trị mới.
        # Thiếu dòng này → kiểm tra tồn và trừ kho trên số cũ → nhiều thu ngân bán cùng 1 món hàng cuối.
        .execution_options(populate_existing=True)
    ).all()
    locked = {row.product_id: row for row in rows}
    missing = [pid for pid in ids if pid not in locked]
    if missing:
        raise AppError("NOT_FOUND", "Không tìm thấy sản phẩm", 404, {"product_ids": missing})
    return locked


def _record(
    db: Session,
    inventory: Inventory,
    *,
    change: int,
    unit_cost: Decimal,
    tx_type: str,
    reference_type: str,
    reference_id: int,
    actor_id: int,
    note: str | None,
) -> InventoryTransaction:
    tx = InventoryTransaction(
        product_id=inventory.product_id,
        type=tx_type,
        quantity_change=change,
        quantity_after=inventory.quantity,
        unit_cost=round_cost(unit_cost),
        avg_cost_after=inventory.avg_cost,
        reference_type=reference_type,
        reference_id=reference_id,
        note=note,
        created_by=actor_id,
    )
    db.add(tx)
    return tx


def receive(
    db: Session,
    inventory: Inventory,
    quantity: int,
    unit_cost: Decimal,
    *,
    tx_type: str,
    reference_type: str,
    reference_id: int,
    actor_id: int,
    note: str | None = None,
) -> InventoryTransaction:
    """Tăng tồn với giá vốn `unit_cost` và tính lại giá vốn bình quân (nhập hàng, khách trả, hủy đơn)."""
    inventory.avg_cost = weighted_average_cost(inventory.quantity, inventory.avg_cost, quantity, unit_cost)
    inventory.quantity += quantity
    return _record(
        db,
        inventory,
        change=quantity,
        unit_cost=unit_cost,
        tx_type=tx_type,
        reference_type=reference_type,
        reference_id=reference_id,
        actor_id=actor_id,
        note=note,
    )


def issue(
    db: Session,
    inventory: Inventory,
    quantity: int,
    *,
    tx_type: str,
    reference_type: str,
    reference_id: int,
    actor_id: int,
    error_code: str = "OUT_OF_STOCK",
    note: str | None = None,
) -> InventoryTransaction:
    """Giảm tồn theo giá vốn bình quân hiện tại (giá vốn không đổi). Không cho tồn âm."""
    if inventory.quantity < quantity:
        raise AppError(
            error_code,
            "Không đủ hàng trong kho",
            409,
            {"product_id": inventory.product_id, "requested": quantity, "available": inventory.quantity},
        )
    inventory.quantity -= quantity
    return _record(
        db,
        inventory,
        change=-quantity,
        unit_cost=inventory.avg_cost,
        tx_type=tx_type,
        reference_type=reference_type,
        reference_id=reference_id,
        actor_id=actor_id,
        note=note,
    )
