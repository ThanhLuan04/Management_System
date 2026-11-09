from typing import Annotated

from fastapi import APIRouter, Depends, Request, status

from app.api.deps import DbSession, client_ip, require_permission
from app.core.permissions import Permission
from app.models import User
from app.schemas.modifier import GroupIn, GroupOut
from app.services import modifier_service

router = APIRouter(prefix="/modifier-groups", tags=["modifiers"])

CatalogViewer = Annotated[User, Depends(require_permission(Permission.CATALOG_VIEW))]
CatalogManager = Annotated[User, Depends(require_permission(Permission.CATALOG_MANAGE))]


@router.get("", response_model=list[GroupOut], summary="Nhóm tùy chọn món (size, topping…)")
def list_groups(_: CatalogViewer, db: DbSession):
    counts = modifier_service.dish_counts(db)
    return [modifier_service.to_out(g, counts.get(g.id, 0)) for g in modifier_service.list_groups(db)]


@router.post("", response_model=GroupOut, status_code=status.HTTP_201_CREATED, summary="Tạo nhóm tùy chọn")
def create_group(body: GroupIn, request: Request, actor: CatalogManager, db: DbSession):
    group = modifier_service.save_group(db, None, body, actor, client_ip(request))
    return modifier_service.to_out(group, 0)


@router.put(
    "/{group_id}",
    response_model=GroupOut,
    summary="Lưu cả nhóm (lựa chọn bị bỏ khỏi danh sách sẽ ngừng dùng, không xóa)",
)
def update_group(group_id: int, body: GroupIn, request: Request, actor: CatalogManager, db: DbSession):
    group = modifier_service.save_group(db, group_id, body, actor, client_ip(request))
    return modifier_service.to_out(group, modifier_service.dish_counts(db).get(group.id, 0))
