from typing import Annotated

from fastapi import APIRouter, Depends, Response, status

from app.api.deps import DbSession, require_permission
from app.core.permissions import Permission
from app.models import User
from app.schemas.kitchen import KitchenStatusUpdate, KitchenTicketOut
from app.services import kitchen_service

router = APIRouter(prefix="/kitchen", tags=["kitchen"])

KitchenStaff = Annotated[User, Depends(require_permission(Permission.KITCHEN_OPERATE))]


@router.get(
    "/tickets",
    response_model=list[KitchenTicketOut],
    summary="Phiếu bếp đang chờ / đang làm / xong chưa giao (cũ nhất trước)",
)
def list_tickets(_: KitchenStaff, db: DbSession):
    return [kitchen_service.to_ticket(order) for order in kitchen_service.list_tickets(db)]


@router.patch(
    "/items/{item_id}", response_model=KitchenTicketOut, summary="Đổi trạng thái một món (tới / lùi một bước)"
)
def set_item_status(item_id: int, body: KitchenStatusUpdate, _: KitchenStaff, db: DbSession):
    return kitchen_service.to_ticket(kitchen_service.set_item_status(db, item_id, body.status))


@router.post(
    "/tickets/{order_id}/status",
    response_model=KitchenTicketOut,
    summary="Cả phiếu: đưa mọi món lên trạng thái (vd. Xong cả phiếu, Giao cả phiếu)",
)
def advance_ticket(order_id: int, body: KitchenStatusUpdate, _: KitchenStaff, db: DbSession):
    return kitchen_service.to_ticket(kitchen_service.advance_ticket(db, order_id, body.status))


@router.post(
    "/tickets/{order_id}/acknowledge",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Bếp đã biết đơn bị hủy — ẩn phiếu khỏi màn hình",
)
def acknowledge_cancel(order_id: int, _: KitchenStaff, db: DbSession):
    kitchen_service.acknowledge_cancel(db, order_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
