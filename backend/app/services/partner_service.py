"""Nghiệp vụ nhà cung cấp và khách hàng (không xóa cứng — chỉ ngừng sử dụng)."""

import re

from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.models import Customer, Supplier, User
from app.schemas.partner import CustomerCreate, SupplierCreate
from app.services import audit_service, code_gen
from app.utils.pagination import apply_sort, paginate

_SUPPLIER_FIELDS = ("name", "contact_name", "phone", "email", "address", "tax_code", "note", "is_active")
_CUSTOMER_FIELDS = ("name", "phone", "email", "address", "note", "is_active")

SUPPLIER_SORT = {"code": Supplier.code, "name": Supplier.name, "created_at": Supplier.created_at}
CUSTOMER_SORT = {"code": Customer.code, "name": Customer.name, "created_at": Customer.created_at}

_DUPLICATE_PHONE = AppError("DUPLICATE_PHONE", "Số điện thoại đã thuộc về khách hàng khác", 409)


def _apply_changes(
    db: Session,
    entity,
    changes: dict,
    fields: tuple[str, ...],
    *,
    action: str,
    entity_type: str,
    actor: User,
    ip: str | None,
) -> None:
    # Tên và trạng thái không được để trống: gửi null nghĩa là không đổi. Các trường khác null = xóa giá trị.
    for required in ("name", "is_active"):
        if changes.get(required, ...) is None:
            changes.pop(required)

    before = {k: getattr(entity, k) for k in fields}
    for key, value in changes.items():
        setattr(entity, key, value)
    changed = [k for k in fields if before[k] != getattr(entity, k)]
    if changed:
        audit_service.record(
            db,
            action=action,
            user_id=actor.id,
            entity_type=entity_type,
            entity_id=entity.id,
            old_values={k: before[k] for k in changed},
            new_values={k: getattr(entity, k) for k in changed},
            ip_address=ip,
        )


# ====================== Nhà cung cấp ======================


def list_suppliers(
    db: Session, *, q: str | None, is_active: bool | None, page: int, page_size: int, sort: str | None
) -> tuple[list[Supplier], int]:
    stmt = select(Supplier)
    if q:
        q = q.strip()
        stmt = stmt.where(
            or_(
                Supplier.code.icontains(q, autoescape=True),
                Supplier.name.icontains(q, autoescape=True),
                Supplier.contact_name.icontains(q, autoescape=True),
                Supplier.phone.icontains(q, autoescape=True),
            )
        )
    if is_active is not None:
        stmt = stmt.where(Supplier.is_active.is_(is_active))
    stmt = apply_sort(stmt, sort, SUPPLIER_SORT, default="code")
    return paginate(db, stmt, page, page_size)


def get_supplier(db: Session, supplier_id: int) -> Supplier:
    supplier = db.get(Supplier, supplier_id)
    if supplier is None:
        raise AppError("NOT_FOUND", "Không tìm thấy nhà cung cấp", 404)
    return supplier


def create_supplier(db: Session, data: SupplierCreate, actor: User, ip: str | None) -> Supplier:
    supplier = Supplier(code=code_gen.master_code(db, "NCC", 4), **data.model_dump())
    db.add(supplier)
    db.flush()
    audit_service.record(
        db,
        action="SUPPLIER_CREATE",
        user_id=actor.id,
        entity_type="supplier",
        entity_id=supplier.id,
        new_values={"code": supplier.code, **data.model_dump()},
        ip_address=ip,
    )
    db.commit()
    return supplier


def update_supplier(db: Session, supplier_id: int, changes: dict, actor: User, ip: str | None) -> Supplier:
    supplier = get_supplier(db, supplier_id)
    _apply_changes(
        db,
        supplier,
        changes,
        _SUPPLIER_FIELDS,
        action="SUPPLIER_UPDATE",
        entity_type="supplier",
        actor=actor,
        ip=ip,
    )
    db.commit()
    return supplier


# ====================== Khách hàng ======================


def list_customers(
    db: Session, *, q: str | None, is_active: bool | None, page: int, page_size: int, sort: str | None
) -> tuple[list[Customer], int]:
    stmt = select(Customer)
    if q:
        q = q.strip()
        conditions = [
            Customer.code.icontains(q, autoescape=True),
            Customer.name.icontains(q, autoescape=True),
        ]
        digits = re.sub(r"\D", "", q)
        if len(digits) >= 3:
            # Thu ngân gõ "0901 234" hay "901234" đều tìm được (SĐT lưu dạng chỉ có chữ số)
            conditions.append(Customer.phone.contains(digits))
        stmt = stmt.where(or_(*conditions))
    if is_active is not None:
        stmt = stmt.where(Customer.is_active.is_(is_active))
    stmt = apply_sort(stmt, sort, CUSTOMER_SORT, default="-created_at")
    return paginate(db, stmt, page, page_size)


def get_customer(db: Session, customer_id: int) -> Customer:
    customer = db.get(Customer, customer_id)
    if customer is None:
        raise AppError("NOT_FOUND", "Không tìm thấy khách hàng", 404)
    return customer


def _ensure_phone_available(db: Session, phone: str | None, exclude_id: int | None = None) -> None:
    if phone is None:
        return
    stmt = select(Customer.id).where(Customer.phone == phone)
    if exclude_id is not None:
        stmt = stmt.where(Customer.id != exclude_id)
    if db.scalar(stmt) is not None:
        raise _DUPLICATE_PHONE


def _commit_customer(db: Session) -> None:
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        constraint = getattr(getattr(exc.orig, "diag", None), "constraint_name", "") or ""
        if constraint == "uq_customers_phone":
            raise _DUPLICATE_PHONE from exc
        raise


def create_customer(db: Session, data: CustomerCreate, actor: User, ip: str | None) -> Customer:
    _ensure_phone_available(db, data.phone)
    customer = Customer(code=code_gen.master_code(db, "KH", 6), **data.model_dump())
    db.add(customer)
    db.flush()
    audit_service.record(
        db,
        action="CUSTOMER_CREATE",
        user_id=actor.id,
        entity_type="customer",
        entity_id=customer.id,
        new_values={"code": customer.code, **data.model_dump()},
        ip_address=ip,
    )
    _commit_customer(db)
    return customer


def update_customer(db: Session, customer_id: int, changes: dict, actor: User, ip: str | None) -> Customer:
    customer = get_customer(db, customer_id)
    if "phone" in changes:
        _ensure_phone_available(db, changes["phone"], exclude_id=customer.id)
    _apply_changes(
        db,
        customer,
        changes,
        _CUSTOMER_FIELDS,
        action="CUSTOMER_UPDATE",
        entity_type="customer",
        actor=actor,
        ip=ip,
    )
    _commit_customer(db)
    return customer
