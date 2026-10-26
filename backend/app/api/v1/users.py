from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, status

from app.api.deps import DbSession, client_ip, require_permission
from app.core.permissions import Permission
from app.models import User
from app.schemas.common import Page, PageParams
from app.schemas.user import PasswordReset, RoleOut, UserCreate, UserOut, UserStatusUpdate, UserUpdate
from app.services import user_service

router = APIRouter(tags=["users"])

AdminUser = Annotated[User, Depends(require_permission(Permission.USERS_MANAGE))]


@router.get("/roles", response_model=list[RoleOut], summary="Danh sách vai trò")
def list_roles(_: AdminUser, db: DbSession):
    return user_service.list_roles(db)


@router.get("/users", response_model=Page[UserOut], summary="Danh sách người dùng")
def list_users(
    _: AdminUser,
    db: DbSession,
    params: Annotated[PageParams, Depends()],
    q: Annotated[str | None, Query(max_length=100, description="Tìm theo username, họ tên, email")] = None,
    role: Annotated[str | None, Query(description="ADMIN | MANAGER | CASHIER")] = None,
    is_active: bool | None = None,
):
    items, total = user_service.list_users(
        db,
        q=q,
        role=role,
        is_active=is_active,
        page=params.page,
        page_size=params.page_size,
        sort=params.sort,
    )
    return Page[UserOut](items=items, page=params.page, page_size=params.page_size, total=total)


@router.post("/users", response_model=UserOut, status_code=status.HTTP_201_CREATED, summary="Tạo người dùng")
def create_user(body: UserCreate, request: Request, actor: AdminUser, db: DbSession):
    return user_service.create_user(db, body, actor.id, client_ip(request))


@router.get("/users/{user_id}", response_model=UserOut, summary="Chi tiết người dùng")
def get_user(user_id: int, _: AdminUser, db: DbSession):
    return user_service.get_user(db, user_id)


@router.patch("/users/{user_id}", response_model=UserOut, summary="Cập nhật người dùng")
def update_user(user_id: int, body: UserUpdate, request: Request, actor: AdminUser, db: DbSession):
    return user_service.update_user(
        db, actor, user_id, body.model_dump(exclude_unset=True), client_ip(request)
    )


@router.patch("/users/{user_id}/status", response_model=UserOut, summary="Khóa / mở khóa tài khoản")
def set_status(user_id: int, body: UserStatusUpdate, request: Request, actor: AdminUser, db: DbSession):
    return user_service.set_status(db, actor, user_id, body.is_active, client_ip(request))


@router.post(
    "/users/{user_id}/reset-password",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Đặt lại mật khẩu (Admin)",
)
def reset_password(user_id: int, body: PasswordReset, request: Request, actor: AdminUser, db: DbSession):
    user_service.reset_password(db, actor, user_id, body.new_password, client_ip(request))
