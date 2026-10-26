from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request

from app.api.deps import CurrentUser, DbSession, client_ip, require_permission
from app.core.permissions import Permission, permissions_for
from app.models import User
from app.schemas.common import Page, PageParams
from app.schemas.report import AuditLogOut, SettingsOut
from app.schemas.settings import SettingsUpdate
from app.services import audit_query_service, settings_service
from app.utils.dates import validate_date_range

router = APIRouter()

SettingsManager = Annotated[User, Depends(require_permission(Permission.SETTINGS_MANAGE))]
AuditViewer = Annotated[User, Depends(require_permission(Permission.AUDIT_VIEW))]


@router.get(
    "/settings",
    response_model=SettingsOut,
    response_model_exclude_unset=True,
    tags=["settings"],
    summary="Xem cài đặt",
)
def get_settings(user: CurrentUser, db: DbSession):
    """Thu ngân chỉ thấy thông tin cửa hàng, thời hạn đổi trả và giới hạn giảm giá của chính mình."""
    can_manage = Permission.SETTINGS_MANAGE in permissions_for(user.role.code)
    return settings_service.settings_out(db, user.role.code, can_manage)


@router.patch("/settings", response_model=SettingsOut, tags=["settings"], summary="Sửa cài đặt (Admin)")
def update_settings(body: SettingsUpdate, request: Request, actor: SettingsManager, db: DbSession):
    settings_service.update_settings(db, body.model_dump(exclude_unset=True), actor, client_ip(request))
    return settings_service.settings_out(db, actor.role.code, True)


@router.get(
    "/audit-logs", response_model=Page[AuditLogOut], tags=["audit"], summary="Nhật ký thao tác (Admin)"
)
def list_audit_logs(
    _: AuditViewer,
    db: DbSession,
    params: Annotated[PageParams, Depends()],
    user_id: int | None = None,
    action: Annotated[str | None, Query(description="Ví dụ: LOGIN_FAILED, ORDER_CANCEL")] = None,
    entity_type: Annotated[str | None, Query(description="Ví dụ: product, sales_order")] = None,
    entity_id: int | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
):
    validate_date_range(date_from, date_to)
    items, total = audit_query_service.list_audit_logs(
        db,
        user_id=user_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        date_from=date_from,
        date_to=date_to,
        page=params.page,
        page_size=params.page_size,
    )
    return Page[AuditLogOut](items=items, page=params.page, page_size=params.page_size, total=total)
