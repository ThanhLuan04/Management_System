from typing import Annotated

from fastapi import APIRouter, Depends, File, Query, Request, UploadFile, status

from app.api.deps import DbSession, client_ip, require_permission
from app.core.config import get_settings
from app.core.errors import AppError
from app.core.permissions import Permission, permissions_for
from app.models import User
from app.schemas.catalog import ProductCreate, ProductOut, ProductUpdate
from app.schemas.common import Page, PageParams
from app.services import product_service

router = APIRouter(prefix="/products", tags=["products"])

CatalogViewer = Annotated[User, Depends(require_permission(Permission.CATALOG_VIEW))]
CatalogManager = Annotated[User, Depends(require_permission(Permission.CATALOG_MANAGE))]


def _can_view_cost(user: User) -> bool:
    return Permission.COST_VIEW in permissions_for(user.role.code)


# response_model_exclude_unset: trường avg_cost chỉ xuất hiện khi service đã đặt nó (người có quyền cost.view)


@router.get(
    "",
    response_model=Page[ProductOut],
    response_model_exclude_unset=True,
    summary="Danh sách sản phẩm",
)
def list_products(
    user: CatalogViewer,
    db: DbSession,
    params: Annotated[PageParams, Depends()],
    q: Annotated[str | None, Query(max_length=100, description="Tên, SKU hoặc mã vạch")] = None,
    category_id: Annotated[int | None, Query(description="Bao gồm cả danh mục con")] = None,
    brand_id: int | None = None,
    is_active: bool | None = None,
    low_stock: Annotated[bool | None, Query(description="Chỉ lấy sản phẩm sắp hết hàng")] = None,
):
    items, total = product_service.list_products(
        db,
        q=q,
        category_id=category_id,
        brand_id=brand_id,
        is_active=is_active,
        low_stock=low_stock,
        page=params.page,
        page_size=params.page_size,
        sort=params.sort,
    )
    include_cost = _can_view_cost(user)
    return Page[ProductOut](
        items=[product_service.to_out(p, include_cost) for p in items],
        page=params.page,
        page_size=params.page_size,
        total=total,
    )


@router.post(
    "",
    response_model=ProductOut,
    response_model_exclude_unset=True,
    status_code=status.HTTP_201_CREATED,
    summary="Tạo sản phẩm",
)
def create_product(body: ProductCreate, request: Request, actor: CatalogManager, db: DbSession):
    product = product_service.create_product(db, body, actor, client_ip(request))
    return product_service.to_out(product, _can_view_cost(actor))


@router.get(
    "/{product_id}", response_model=ProductOut, response_model_exclude_unset=True, summary="Chi tiết sản phẩm"
)
def get_product(product_id: int, user: CatalogViewer, db: DbSession):
    return product_service.to_out(product_service.get_product(db, product_id), _can_view_cost(user))


@router.patch(
    "/{product_id}",
    response_model=ProductOut,
    response_model_exclude_unset=True,
    summary="Sửa sản phẩm / ngừng kinh doanh (không sửa được tồn kho)",
)
def update_product(
    product_id: int, body: ProductUpdate, request: Request, actor: CatalogManager, db: DbSession
):
    product = product_service.update_product(
        db, product_id, body.model_dump(exclude_unset=True), actor, client_ip(request)
    )
    return product_service.to_out(product, _can_view_cost(actor))


@router.post(
    "/{product_id}/image",
    response_model=ProductOut,
    response_model_exclude_unset=True,
    summary="Tải ảnh sản phẩm (JPEG/PNG/WebP, tối đa 2MB)",
)
def upload_image(
    product_id: int,
    request: Request,
    actor: CatalogManager,
    db: DbSession,
    file: Annotated[UploadFile, File(description="Ảnh sản phẩm")],
):
    max_bytes = get_settings().max_image_bytes
    # Từ chối sớm theo Content-Length; sau đó chỉ đọc tối đa max+1 byte để không nạp file khổng lồ vào RAM
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > max_bytes + 64 * 1024:
        raise AppError("FILE_TOO_LARGE", f"Ảnh tối đa {max_bytes // (1024 * 1024)}MB", 413)
    content = file.file.read(max_bytes + 1)

    product = product_service.save_image(db, product_id, content, actor, client_ip(request))
    return product_service.to_out(product, _can_view_cost(actor))
