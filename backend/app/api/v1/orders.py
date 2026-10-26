import uuid
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Header, Query, Request, Response, status

from app.api.deps import DbSession, client_ip, require_permission
from app.core.errors import AppError
from app.core.permissions import Permission, permissions_for
from app.models import User
from app.schemas.common import Page, PageParams
from app.schemas.sales import CancelRequest, OrderCreate, OrderOut, OrderSummaryOut, ReturnCreate, ReturnOut
from app.services import return_service, sales_service
from app.utils.dates import validate_date_range

router = APIRouter(prefix="/orders", tags=["orders"])

OrderViewer = Annotated[User, Depends(require_permission(Permission.ORDERS_VIEW))]
OrderCreator = Annotated[User, Depends(require_permission(Permission.ORDERS_CREATE))]
OrderCanceller = Annotated[User, Depends(require_permission(Permission.ORDERS_CANCEL))]
ReturnCreator = Annotated[User, Depends(require_permission(Permission.RETURNS_CREATE))]


def _can_view_cost(user: User) -> bool:
    return Permission.COST_VIEW in permissions_for(user.role.code)


@router.get("", response_model=Page[OrderSummaryOut], summary="Danh sách đơn hàng")
def list_orders(
    _: OrderViewer,
    db: DbSession,
    params: Annotated[PageParams, Depends()],
    q: Annotated[str | None, Query(max_length=100, description="Mã đơn, tên hoặc SĐT khách")] = None,
    status: Annotated[str | None, Query(description="COMPLETED | CANCELLED")] = None,
    customer_id: int | None = None,
    created_by: Annotated[int | None, Query(description="Id thu ngân")] = None,
    payment_method: Annotated[str | None, Query(description="CASH | BANK_TRANSFER | CARD")] = None,
    date_from: date | None = None,
    date_to: date | None = None,
):
    validate_date_range(date_from, date_to)
    items, total = sales_service.list_orders(
        db,
        q=q,
        status=status,
        customer_id=customer_id,
        created_by=created_by,
        payment_method=payment_method,
        date_from=date_from,
        date_to=date_to,
        page=params.page,
        page_size=params.page_size,
        sort=params.sort,
    )
    return Page[OrderSummaryOut](
        items=sales_service.order_summaries(db, items),
        page=params.page,
        page_size=params.page_size,
        total=total,
    )


@router.post(
    "",
    response_model=OrderOut,
    response_model_exclude_unset=True,
    status_code=status.HTTP_201_CREATED,
    summary="Tạo đơn bán hàng + thanh toán",
    description=(
        "Bắt buộc header **Idempotency-Key** (UUID, sinh một lần cho mỗi giỏ hàng). "
        "Gửi lại cùng key và cùng nội dung → trả về đơn đã tạo (200) thay vì tạo đơn mới."
    ),
)
def create_order(
    body: OrderCreate,
    request: Request,
    response: Response,
    actor: OrderCreator,
    db: DbSession,
    idempotency_key: Annotated[uuid.UUID | None, Header(alias="Idempotency-Key")] = None,
):
    if idempotency_key is None:
        raise AppError("IDEMPOTENCY_KEY_REQUIRED", "Thiếu header Idempotency-Key (UUID)", 400)
    order, created = sales_service.create_order(db, body, idempotency_key, actor, client_ip(request))
    if not created:
        response.status_code = status.HTTP_200_OK
    return sales_service.to_out(db, order, _can_view_cost(actor))


@router.get(
    "/{order_id}", response_model=OrderOut, response_model_exclude_unset=True, summary="Chi tiết đơn hàng"
)
def get_order(order_id: int, user: OrderViewer, db: DbSession):
    return sales_service.to_out(db, sales_service.get_order(db, order_id), _can_view_cost(user))


@router.post(
    "/{order_id}/cancel",
    response_model=OrderOut,
    response_model_exclude_unset=True,
    summary="Hủy đơn (trong ngày bán, chưa có phiếu trả)",
)
def cancel_order(order_id: int, body: CancelRequest, request: Request, actor: OrderCanceller, db: DbSession):
    order = sales_service.cancel_order(db, order_id, body.reason, actor, client_ip(request))
    return sales_service.to_out(db, order, _can_view_cost(actor))


@router.post(
    "/{order_id}/returns",
    response_model=ReturnOut,
    response_model_exclude_unset=True,
    status_code=status.HTTP_201_CREATED,
    tags=["returns"],
    summary="Trả hàng cho một đơn",
    description="Bắt buộc header **Idempotency-Key** (UUID) như khi tạo đơn.",
)
def create_return(
    order_id: int,
    body: ReturnCreate,
    request: Request,
    response: Response,
    actor: ReturnCreator,
    db: DbSession,
    idempotency_key: Annotated[uuid.UUID | None, Header(alias="Idempotency-Key")] = None,
):
    if idempotency_key is None:
        raise AppError("IDEMPOTENCY_KEY_REQUIRED", "Thiếu header Idempotency-Key (UUID)", 400)
    sales_return, created = return_service.create_return(
        db, order_id, body, idempotency_key, actor, client_ip(request)
    )
    if not created:
        response.status_code = status.HTTP_200_OK
    return return_service.to_out(sales_return, _can_view_cost(actor))
