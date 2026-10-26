from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, status

from app.api.deps import DbSession, client_ip, require_permission
from app.core.permissions import Permission
from app.models import User
from app.schemas.common import Page, PageParams
from app.schemas.purchase import PurchaseCreate, PurchaseOut, PurchaseSummaryOut
from app.services import purchase_service
from app.utils.dates import validate_date_range

router = APIRouter(prefix="/purchases", tags=["purchases"])

PurchaseManager = Annotated[User, Depends(require_permission(Permission.PURCHASES_MANAGE))]


@router.get("", response_model=Page[PurchaseSummaryOut], summary="Danh sách phiếu nhập")
def list_purchases(
    _: PurchaseManager,
    db: DbSession,
    params: Annotated[PageParams, Depends()],
    q: Annotated[str | None, Query(max_length=50, description="Mã phiếu")] = None,
    supplier_id: int | None = None,
    status: Annotated[str | None, Query(description="DRAFT | CONFIRMED | CANCELLED")] = None,
    date_from: Annotated[date | None, Query(description="Từ ngày tạo (YYYY-MM-DD, giờ VN)")] = None,
    date_to: Annotated[date | None, Query(description="Đến ngày tạo (gồm cả ngày này)")] = None,
):
    validate_date_range(date_from, date_to)
    items, total = purchase_service.list_purchases(
        db,
        q=q,
        supplier_id=supplier_id,
        status=status,
        date_from=date_from,
        date_to=date_to,
        page=params.page,
        page_size=params.page_size,
        sort=params.sort,
    )
    return Page[PurchaseSummaryOut](
        items=[purchase_service.to_summary(o) for o in items],
        page=params.page,
        page_size=params.page_size,
        total=total,
    )


@router.post(
    "", response_model=PurchaseOut, status_code=status.HTTP_201_CREATED, summary="Tạo phiếu nhập nháp"
)
def create_purchase(body: PurchaseCreate, request: Request, actor: PurchaseManager, db: DbSession):
    return purchase_service.to_out(purchase_service.create_purchase(db, body, actor, client_ip(request)))


@router.get("/{purchase_id}", response_model=PurchaseOut, summary="Chi tiết phiếu nhập")
def get_purchase(purchase_id: int, _: PurchaseManager, db: DbSession):
    return purchase_service.to_out(purchase_service.get_purchase(db, purchase_id))


@router.put("/{purchase_id}", response_model=PurchaseOut, summary="Sửa toàn bộ phiếu nhập (chỉ khi còn nháp)")
def replace_purchase(
    purchase_id: int, body: PurchaseCreate, request: Request, actor: PurchaseManager, db: DbSession
):
    return purchase_service.to_out(
        purchase_service.replace_purchase(db, purchase_id, body, actor, client_ip(request))
    )


@router.post("/{purchase_id}/confirm", response_model=PurchaseOut, summary="Xác nhận nhập kho (cộng tồn)")
def confirm_purchase(purchase_id: int, request: Request, actor: PurchaseManager, db: DbSession):
    return purchase_service.to_out(
        purchase_service.confirm_purchase(db, purchase_id, actor, client_ip(request))
    )


@router.post("/{purchase_id}/cancel", response_model=PurchaseOut, summary="Hủy phiếu nhập nháp")
def cancel_purchase(purchase_id: int, request: Request, actor: PurchaseManager, db: DbSession):
    return purchase_service.to_out(
        purchase_service.cancel_purchase(db, purchase_id, actor, client_ip(request))
    )
