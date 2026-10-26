from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, status

from app.api.deps import DbSession, client_ip, require_permission
from app.core.permissions import Permission
from app.models import User
from app.schemas.common import Page, PageParams
from app.schemas.partner import (
    CustomerCreate,
    CustomerOut,
    CustomerUpdate,
    SupplierCreate,
    SupplierOut,
    SupplierUpdate,
)
from app.schemas.sales import OrderSummaryOut
from app.services import partner_service, sales_service

router = APIRouter()

SupplierManager = Annotated[User, Depends(require_permission(Permission.SUPPLIERS_MANAGE))]
CustomerViewer = Annotated[User, Depends(require_permission(Permission.CUSTOMERS_VIEW))]
CustomerManager = Annotated[User, Depends(require_permission(Permission.CUSTOMERS_MANAGE))]
CustomerOrderViewer = Annotated[
    User, Depends(require_permission(Permission.CUSTOMERS_VIEW, Permission.ORDERS_VIEW))
]


# ---------- Nhà cung cấp ----------


@router.get(
    "/suppliers", response_model=Page[SupplierOut], tags=["suppliers"], summary="Danh sách nhà cung cấp"
)
def list_suppliers(
    _: SupplierManager,
    db: DbSession,
    params: Annotated[PageParams, Depends()],
    q: Annotated[str | None, Query(max_length=100, description="Mã, tên, người liên hệ, SĐT")] = None,
    is_active: bool | None = None,
):
    items, total = partner_service.list_suppliers(
        db, q=q, is_active=is_active, page=params.page, page_size=params.page_size, sort=params.sort
    )
    return Page[SupplierOut](items=items, page=params.page, page_size=params.page_size, total=total)


@router.post(
    "/suppliers",
    response_model=SupplierOut,
    status_code=status.HTTP_201_CREATED,
    tags=["suppliers"],
    summary="Tạo nhà cung cấp (mã tự sinh)",
)
def create_supplier(body: SupplierCreate, request: Request, actor: SupplierManager, db: DbSession):
    return partner_service.create_supplier(db, body, actor, client_ip(request))


@router.get(
    "/suppliers/{supplier_id}",
    response_model=SupplierOut,
    tags=["suppliers"],
    summary="Chi tiết nhà cung cấp",
)
def get_supplier(supplier_id: int, _: SupplierManager, db: DbSession):
    return partner_service.get_supplier(db, supplier_id)


@router.patch(
    "/suppliers/{supplier_id}",
    response_model=SupplierOut,
    tags=["suppliers"],
    summary="Sửa / ngừng hợp tác nhà cung cấp",
)
def update_supplier(
    supplier_id: int, body: SupplierUpdate, request: Request, actor: SupplierManager, db: DbSession
):
    return partner_service.update_supplier(
        db, supplier_id, body.model_dump(exclude_unset=True), actor, client_ip(request)
    )


# ---------- Khách hàng ----------


@router.get(
    "/customers", response_model=Page[CustomerOut], tags=["customers"], summary="Danh sách khách hàng"
)
def list_customers(
    _: CustomerViewer,
    db: DbSession,
    params: Annotated[PageParams, Depends()],
    q: Annotated[str | None, Query(max_length=100, description="Mã, tên hoặc số điện thoại")] = None,
    is_active: bool | None = None,
):
    items, total = partner_service.list_customers(
        db, q=q, is_active=is_active, page=params.page, page_size=params.page_size, sort=params.sort
    )
    return Page[CustomerOut](
        items=partner_service.to_customer_outs(db, items),
        page=params.page,
        page_size=params.page_size,
        total=total,
    )


@router.post(
    "/customers",
    response_model=CustomerOut,
    status_code=status.HTTP_201_CREATED,
    tags=["customers"],
    summary="Tạo khách hàng (mã tự sinh)",
)
def create_customer(body: CustomerCreate, request: Request, actor: CustomerManager, db: DbSession):
    customer = partner_service.create_customer(db, body, actor, client_ip(request))
    return partner_service.to_customer_outs(db, [customer])[0]


@router.get(
    "/customers/{customer_id}", response_model=CustomerOut, tags=["customers"], summary="Chi tiết khách hàng"
)
def get_customer(customer_id: int, _: CustomerViewer, db: DbSession):
    return partner_service.to_customer_outs(db, [partner_service.get_customer(db, customer_id)])[0]


@router.get(
    "/customers/{customer_id}/orders",
    response_model=Page[OrderSummaryOut],
    tags=["customers"],
    summary="Lịch sử mua hàng của khách",
)
def customer_orders(
    customer_id: int,
    _: CustomerOrderViewer,
    db: DbSession,
    params: Annotated[PageParams, Depends()],
):
    partner_service.get_customer(db, customer_id)  # 404 nếu khách không tồn tại
    items, total = sales_service.list_orders(
        db,
        q=None,
        status=None,
        customer_id=customer_id,
        created_by=None,
        payment_method=None,
        date_from=None,
        date_to=None,
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


@router.patch(
    "/customers/{customer_id}", response_model=CustomerOut, tags=["customers"], summary="Sửa khách hàng"
)
def update_customer(
    customer_id: int, body: CustomerUpdate, request: Request, actor: CustomerManager, db: DbSession
):
    customer = partner_service.update_customer(
        db, customer_id, body.model_dump(exclude_unset=True), actor, client_ip(request)
    )
    return partner_service.to_customer_outs(db, [customer])[0]
