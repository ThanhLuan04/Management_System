from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.api.deps import DbSession, require_permission
from app.core.permissions import Permission, permissions_for
from app.models import User
from app.schemas.common import Page, PageParams
from app.schemas.sales import ReturnOut, ReturnSummaryOut
from app.services import return_service
from app.utils.dates import validate_date_range

router = APIRouter(prefix="/returns", tags=["returns"])

ReturnViewer = Annotated[User, Depends(require_permission(Permission.ORDERS_VIEW))]


@router.get("", response_model=Page[ReturnSummaryOut], summary="Danh sách phiếu trả hàng")
def list_returns(
    _: ReturnViewer,
    db: DbSession,
    params: Annotated[PageParams, Depends()],
    q: Annotated[str | None, Query(max_length=100, description="Mã phiếu trả, mã đơn hoặc tên khách")] = None,
    order_id: int | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
):
    validate_date_range(date_from, date_to)
    items, total = return_service.list_returns(
        db,
        q=q,
        order_id=order_id,
        date_from=date_from,
        date_to=date_to,
        page=params.page,
        page_size=params.page_size,
    )
    return Page[ReturnSummaryOut](
        items=[return_service.to_summary(r) for r in items],
        page=params.page,
        page_size=params.page_size,
        total=total,
    )


@router.get(
    "/{return_id}",
    response_model=ReturnOut,
    response_model_exclude_unset=True,
    summary="Chi tiết phiếu trả hàng",
)
def get_return(return_id: int, user: ReturnViewer, db: DbSession):
    include_cost = Permission.COST_VIEW in permissions_for(user.role.code)
    return return_service.to_out(return_service.get_return(db, return_id), include_cost)
