from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, status

from app.api.deps import DbSession, client_ip, require_permission
from app.core.permissions import Permission, permissions_for
from app.models import User
from app.schemas.common import Page, PageParams
from app.schemas.inventory import (
    AdjustmentCreate,
    AdjustmentOut,
    AdjustmentSummaryOut,
    InventoryItemOut,
    InventoryTransactionOut,
    ProductStockOut,
)
from app.services import inventory_service
from app.utils.dates import validate_date_range

router = APIRouter(tags=["inventory"])

InventoryViewer = Annotated[User, Depends(require_permission(Permission.INVENTORY_VIEW))]
# Lịch sử kho và phiếu điều chỉnh: dành cho người quản lý kho (Admin, Manager)
InventoryManager = Annotated[User, Depends(require_permission(Permission.INVENTORY_ADJUST))]


def _can_view_cost(user: User) -> bool:
    return Permission.COST_VIEW in permissions_for(user.role.code)


@router.get(
    "/inventory",
    response_model=Page[InventoryItemOut],
    response_model_exclude_unset=True,
    summary="Tồn kho theo sản phẩm",
)
def list_inventory(
    user: InventoryViewer,
    db: DbSession,
    params: Annotated[PageParams, Depends()],
    q: Annotated[str | None, Query(max_length=100, description="Tên, SKU hoặc mã vạch")] = None,
    category_id: int | None = None,
    is_active: bool | None = None,
    low_stock: Annotated[bool | None, Query(description="Chỉ sản phẩm sắp hết (tồn ≤ mức tối thiểu)")] = None,
    out_of_stock: Annotated[bool | None, Query(description="Chỉ sản phẩm hết hàng")] = None,
):
    items, total = inventory_service.list_inventory(
        db,
        q=q,
        category_id=category_id,
        is_active=is_active,
        low_stock=low_stock,
        out_of_stock=out_of_stock,
        page=params.page,
        page_size=params.page_size,
        sort=params.sort,
        include_cost=_can_view_cost(user),
    )
    return Page[InventoryItemOut](items=items, page=params.page, page_size=params.page_size, total=total)


@router.get(
    "/inventory/transactions",
    response_model=Page[InventoryTransactionOut],
    response_model_exclude_unset=True,
    summary="Lịch sử biến động kho",
)
def list_transactions(
    user: InventoryManager,
    db: DbSession,
    params: Annotated[PageParams, Depends()],
    product_id: int | None = None,
    type: Annotated[
        str | None, Query(description="PURCHASE | SALE | SALE_RETURN | ORDER_CANCEL | ADJUSTMENT")
    ] = None,
    date_from: date | None = None,
    date_to: date | None = None,
):
    validate_date_range(date_from, date_to)
    items, total = inventory_service.list_transactions(
        db,
        product_id=product_id,
        tx_type=type,
        date_from=date_from,
        date_to=date_to,
        page=params.page,
        page_size=params.page_size,
        include_cost=_can_view_cost(user),
    )
    return Page[InventoryTransactionOut](
        items=items, page=params.page, page_size=params.page_size, total=total
    )


@router.get(
    "/products/{product_id}/inventory",
    response_model=ProductStockOut,
    response_model_exclude_unset=True,
    tags=["products"],
    summary="Tồn kho hiện tại và 20 biến động gần nhất của một sản phẩm",
)
def product_stock(product_id: int, user: InventoryViewer, db: DbSession):
    return inventory_service.product_stock(db, product_id, _can_view_cost(user))


@router.post(
    "/inventory/adjustments",
    response_model=AdjustmentOut,
    response_model_exclude_unset=True,
    status_code=status.HTTP_201_CREATED,
    summary="Điều chỉnh kho / kiểm kê",
)
def create_adjustment(body: AdjustmentCreate, request: Request, actor: InventoryManager, db: DbSession):
    adjustment = inventory_service.create_adjustment(db, body, actor, client_ip(request))
    return inventory_service.adjustment_out(adjustment, _can_view_cost(actor))


@router.get(
    "/inventory/adjustments", response_model=Page[AdjustmentSummaryOut], summary="Danh sách phiếu điều chỉnh"
)
def list_adjustments(
    _: InventoryManager,
    db: DbSession,
    params: Annotated[PageParams, Depends()],
    type: Annotated[str | None, Query(description="ADJUSTMENT | STOCKTAKE")] = None,
    date_from: date | None = None,
    date_to: date | None = None,
):
    validate_date_range(date_from, date_to)
    items, total = inventory_service.list_adjustments(
        db, adj_type=type, date_from=date_from, date_to=date_to, page=params.page, page_size=params.page_size
    )
    return Page[AdjustmentSummaryOut](
        items=[inventory_service.adjustment_summary(a) for a in items],
        page=params.page,
        page_size=params.page_size,
        total=total,
    )


@router.get(
    "/inventory/adjustments/{adjustment_id}",
    response_model=AdjustmentOut,
    response_model_exclude_unset=True,
    summary="Chi tiết phiếu điều chỉnh",
)
def get_adjustment(adjustment_id: int, user: InventoryManager, db: DbSession):
    return inventory_service.adjustment_out(
        inventory_service.get_adjustment(db, adjustment_id), _can_view_cost(user)
    )
