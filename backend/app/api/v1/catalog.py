from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, status

from app.api.deps import DbSession, client_ip, require_permission
from app.core.permissions import Permission
from app.models import User
from app.schemas.catalog import (
    BrandCreate,
    BrandOut,
    BrandUpdate,
    CategoryCreate,
    CategoryOut,
    CategoryTreeOut,
    CategoryUpdate,
)
from app.services import catalog_service

router = APIRouter(tags=["catalog"])

CatalogViewer = Annotated[User, Depends(require_permission(Permission.CATALOG_VIEW))]
CatalogManager = Annotated[User, Depends(require_permission(Permission.CATALOG_MANAGE))]


# ---------- Danh mục ----------


@router.get(
    "/categories",
    response_model=list[CategoryTreeOut] | list[CategoryOut],
    summary="Danh sách danh mục (tree=true trả dạng cây 2 cấp)",
)
def list_categories(
    _: CatalogViewer,
    db: DbSession,
    q: Annotated[str | None, Query(max_length=100)] = None,
    is_active: bool | None = None,
    parent_id: int | None = None,
    tree: bool = False,
):
    return catalog_service.list_categories(db, q=q, is_active=is_active, parent_id=parent_id, tree=tree)


@router.post(
    "/categories", response_model=CategoryOut, status_code=status.HTTP_201_CREATED, summary="Tạo danh mục"
)
def create_category(body: CategoryCreate, request: Request, actor: CatalogManager, db: DbSession):
    return catalog_service.create_category(db, body, actor, client_ip(request))


@router.get("/categories/{category_id}", response_model=CategoryOut, summary="Chi tiết danh mục")
def get_category(category_id: int, _: CatalogViewer, db: DbSession):
    return catalog_service.category_detail(db, category_id)


@router.patch("/categories/{category_id}", response_model=CategoryOut, summary="Sửa / ngừng sử dụng danh mục")
def update_category(
    category_id: int, body: CategoryUpdate, request: Request, actor: CatalogManager, db: DbSession
):
    return catalog_service.update_category(
        db, category_id, body.model_dump(exclude_unset=True), actor, client_ip(request)
    )


# ---------- Thương hiệu ----------


@router.get("/brands", response_model=list[BrandOut], summary="Danh sách thương hiệu")
def list_brands(
    _: CatalogViewer,
    db: DbSession,
    q: Annotated[str | None, Query(max_length=100)] = None,
    is_active: bool | None = None,
):
    return catalog_service.list_brands(db, q=q, is_active=is_active)


@router.post(
    "/brands", response_model=BrandOut, status_code=status.HTTP_201_CREATED, summary="Tạo thương hiệu"
)
def create_brand(body: BrandCreate, request: Request, actor: CatalogManager, db: DbSession):
    return catalog_service.create_brand(db, body, actor, client_ip(request))


@router.patch("/brands/{brand_id}", response_model=BrandOut, summary="Sửa / ngừng sử dụng thương hiệu")
def update_brand(brand_id: int, body: BrandUpdate, request: Request, actor: CatalogManager, db: DbSession):
    return catalog_service.update_brand(
        db, brand_id, body.model_dump(exclude_unset=True), actor, client_ip(request)
    )
