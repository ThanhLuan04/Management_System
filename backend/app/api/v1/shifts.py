from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Request, status

from app.api.deps import DbSession, client_ip, require_permission
from app.core.permissions import Permission
from app.models import User
from app.schemas.common import Page, PageParams
from app.schemas.shift import ShiftClose, ShiftCurrentOut, ShiftOpen, ShiftOut, ShiftSummaryOut
from app.services import shift_service
from app.utils.dates import validate_date_range

router = APIRouter(prefix="/shifts", tags=["shifts"])

# Người bán hàng (thu ngân trở lên) mở / đóng ca của két chung; xem lịch sử mọi ca cần quyền báo cáo
Seller = Annotated[User, Depends(require_permission(Permission.ORDERS_CREATE))]
ShiftViewer = Annotated[User, Depends(require_permission(Permission.REPORTS_VIEW))]


@router.get(
    "/current", response_model=ShiftCurrentOut, summary="Ca đang mở (null nếu chưa mở) + gợi ý tiền đầu ca"
)
def current(_: Seller, db: DbSession):
    shift = shift_service.current_shift(db)
    return ShiftCurrentOut(
        shift=shift_service.to_out(db, shift) if shift else None,
        suggested_opening_cash=shift_service.suggested_opening_cash(db),
    )


@router.post("/open", response_model=ShiftOut, status_code=status.HTTP_201_CREATED, summary="Mở ca")
def open_shift(body: ShiftOpen, request: Request, actor: Seller, db: DbSession):
    shift = shift_service.open_shift(db, body.opening_cash, actor, client_ip(request))
    return shift_service.to_out(db, shift)


@router.post("/{shift_id}/close", response_model=ShiftOut, summary="Đóng ca: nhập tiền đếm được trong két")
def close_shift(shift_id: int, body: ShiftClose, request: Request, actor: Seller, db: DbSession):
    shift = shift_service.close_shift(db, shift_id, body.counted_cash, body.note, actor, client_ip(request))
    return shift_service.to_out(db, shift)


@router.get("", response_model=Page[ShiftSummaryOut], summary="Lịch sử ca (Quản lý, Admin)")
def list_shifts(
    _: ShiftViewer,
    db: DbSession,
    params: Annotated[PageParams, Depends()],
    date_from: date | None = None,
    date_to: date | None = None,
    discrepancy_only: bool = False,
):
    validate_date_range(date_from, date_to)
    items, total = shift_service.list_shifts(
        db,
        date_from=date_from,
        date_to=date_to,
        discrepancy_only=discrepancy_only,
        page=params.page,
        page_size=params.page_size,
    )
    return Page[ShiftSummaryOut](
        items=[shift_service.to_summary(s) for s in items],
        page=params.page,
        page_size=params.page_size,
        total=total,
    )


@router.get(
    "/{shift_id}",
    response_model=ShiftOut,
    summary="Chi tiết ca: tiền theo phương thức, doanh số từng thu ngân",
)
def get_shift(shift_id: int, _: ShiftViewer, db: DbSession):
    return shift_service.to_out(db, shift_service.get_shift(db, shift_id))
