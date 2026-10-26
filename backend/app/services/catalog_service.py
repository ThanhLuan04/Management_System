"""Nghiệp vụ danh mục và thương hiệu."""

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.models import Brand, Category, Product, User
from app.schemas.catalog import BrandCreate, CategoryCreate, CategoryOut, CategoryTreeOut
from app.services import audit_service


def _field_error(field: str, message: str) -> AppError:
    return AppError("VALIDATION_ERROR", "Dữ liệu không hợp lệ", 422, [{"field": field, "message": message}])


def _commit(db: Session, duplicate: AppError) -> None:
    """Commit; nếu unique index trong DB chặn (hai request trùng tên cùng lúc) thì trả lỗi 409 dễ hiểu."""
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise duplicate from exc


def _audit_diff(
    db: Session,
    *,
    action: str,
    actor: User,
    entity_type: str,
    entity_id: int,
    before: dict,
    after: dict,
    ip: str | None,
) -> None:
    changed = [k for k in after if before.get(k) != after[k]]
    if changed:
        audit_service.record(
            db,
            action=action,
            user_id=actor.id,
            entity_type=entity_type,
            entity_id=entity_id,
            old_values={k: before.get(k) for k in changed},
            new_values={k: after[k] for k in changed},
            ip_address=ip,
        )


# ====================== Danh mục ======================

_CATEGORY_FIELDS = ("name", "parent_id", "description", "is_active")
_DUPLICATE_CATEGORY = AppError("DUPLICATE_CATEGORY", "Tên danh mục đã tồn tại trong cùng danh mục cha", 409)


def _active_product_count_subquery():
    return (
        select(Product.category_id, func.count().label("product_count"))
        .where(Product.is_active.is_(True))
        .group_by(Product.category_id)
        .subquery()
    )


def _category_out(category: Category, product_count: int) -> CategoryOut:
    out = CategoryOut.model_validate(category)
    out.parent_name = category.parent.name if category.parent else None
    out.product_count = product_count
    return out


def list_categories(
    db: Session, *, q: str | None, is_active: bool | None, parent_id: int | None, tree: bool
) -> list[CategoryOut] | list[CategoryTreeOut]:
    counts = _active_product_count_subquery()
    stmt = (
        select(Category, func.coalesce(counts.c.product_count, 0))
        .outerjoin(counts, counts.c.category_id == Category.id)
        .order_by(func.lower(Category.name))
    )
    if q:
        stmt = stmt.where(Category.name.icontains(q.strip(), autoescape=True))
    if is_active is not None:
        stmt = stmt.where(Category.is_active.is_(is_active))
    if parent_id is not None:
        stmt = stmt.where(Category.parent_id == parent_id)

    rows = [_category_out(category, count) for category, count in db.execute(stmt).unique()]
    if not tree:
        return rows

    # Dạng cây 2 cấp: danh mục gốc kèm danh sách con
    roots = {c.id: CategoryTreeOut(**c.model_dump()) for c in rows if c.parent_id is None}
    for c in rows:
        if c.parent_id is not None and c.parent_id in roots:
            roots[c.parent_id].children.append(c)
    return list(roots.values())


def get_category(db: Session, category_id: int) -> Category:
    category = db.get(Category, category_id)
    if category is None:
        raise AppError("NOT_FOUND", "Không tìm thấy danh mục", 404)
    return category


def category_detail(db: Session, category_id: int) -> CategoryOut:
    category = get_category(db, category_id)
    count = db.scalar(
        select(func.count()).where(Product.category_id == category.id, Product.is_active.is_(True))
    )
    return _category_out(category, count or 0)


def _validate_parent(db: Session, parent_id: int, category: Category | None = None) -> Category:
    parent = db.get(Category, parent_id)
    if parent is None:
        raise _field_error("parent_id", "Danh mục cha không tồn tại")
    if category is not None and parent.id == category.id:
        raise _field_error("parent_id", "Danh mục không thể là cha của chính nó")
    if parent.parent_id is not None:
        raise _field_error("parent_id", "Chỉ hỗ trợ tối đa 2 cấp danh mục")
    if not parent.is_active:
        raise _field_error("parent_id", "Danh mục cha đã ngừng sử dụng")
    if category is not None and db.scalar(
        select(Category.id).where(Category.parent_id == category.id).limit(1)
    ):
        raise _field_error("parent_id", "Danh mục đang có danh mục con nên không thể trở thành danh mục con")
    return parent


def _ensure_category_name_available(
    db: Session, name: str, parent_id: int | None, exclude_id: int | None = None
) -> None:
    stmt = select(Category.id).where(
        func.coalesce(Category.parent_id, 0) == (parent_id or 0),
        func.lower(Category.name) == name.lower(),
    )
    if exclude_id is not None:
        stmt = stmt.where(Category.id != exclude_id)
    if db.scalar(stmt) is not None:
        raise _DUPLICATE_CATEGORY


def create_category(db: Session, data: CategoryCreate, actor: User, ip: str | None) -> CategoryOut:
    if data.parent_id is not None:
        _validate_parent(db, data.parent_id)
    _ensure_category_name_available(db, data.name, data.parent_id)

    category = Category(name=data.name, parent_id=data.parent_id, description=data.description)
    db.add(category)
    db.flush()
    audit_service.record(
        db,
        action="CATEGORY_CREATE",
        user_id=actor.id,
        entity_type="category",
        entity_id=category.id,
        new_values={k: getattr(category, k) for k in _CATEGORY_FIELDS},
        ip_address=ip,
    )
    _commit(db, _DUPLICATE_CATEGORY)
    return category_detail(db, category.id)


def update_category(db: Session, category_id: int, changes: dict, actor: User, ip: str | None) -> CategoryOut:
    category = get_category(db, category_id)
    before = {k: getattr(category, k) for k in _CATEGORY_FIELDS}

    for required in ("name", "is_active"):
        if changes.get(required, ...) is None:
            changes.pop(required)

    if "parent_id" in changes and changes["parent_id"] != category.parent_id:
        if changes["parent_id"] is not None:
            _validate_parent(db, changes["parent_id"], category)
    new_name = changes.get("name", category.name)
    new_parent = changes.get("parent_id", category.parent_id)
    if new_name.lower() != category.name.lower() or new_parent != category.parent_id:
        _ensure_category_name_available(db, new_name, new_parent, exclude_id=category.id)

    if changes.get("is_active") is False and category.is_active:
        # BR-P06: không ngừng sử dụng danh mục còn sản phẩm đang kinh doanh hoặc còn danh mục con đang dùng
        if db.scalar(
            select(Product.id).where(Product.category_id == category.id, Product.is_active.is_(True)).limit(1)
        ):
            raise AppError("CATEGORY_IN_USE", "Danh mục còn sản phẩm đang kinh doanh", 409)
        if db.scalar(
            select(Category.id)
            .where(Category.parent_id == category.id, Category.is_active.is_(True))
            .limit(1)
        ):
            raise AppError("CATEGORY_IN_USE", "Danh mục còn danh mục con đang sử dụng", 409)
    if changes.get("is_active") is True and category.parent_id is not None and not category.parent.is_active:
        raise AppError("CATEGORY_PARENT_INACTIVE", "Hãy kích hoạt lại danh mục cha trước", 409)

    for key, value in changes.items():
        setattr(category, key, value)
    db.flush()
    db.refresh(category, ["parent"])

    _audit_diff(
        db,
        action="CATEGORY_UPDATE",
        actor=actor,
        entity_type="category",
        entity_id=category.id,
        before=before,
        after={k: getattr(category, k) for k in _CATEGORY_FIELDS},
        ip=ip,
    )
    _commit(db, _DUPLICATE_CATEGORY)
    return category_detail(db, category.id)


# ====================== Thương hiệu ======================

_DUPLICATE_BRAND = AppError("DUPLICATE_BRAND", "Tên thương hiệu đã tồn tại", 409)


def list_brands(db: Session, *, q: str | None, is_active: bool | None) -> list[Brand]:
    stmt = select(Brand).order_by(func.lower(Brand.name))
    if q:
        stmt = stmt.where(Brand.name.icontains(q.strip(), autoescape=True))
    if is_active is not None:
        stmt = stmt.where(Brand.is_active.is_(is_active))
    return list(db.scalars(stmt))


def get_brand(db: Session, brand_id: int) -> Brand:
    brand = db.get(Brand, brand_id)
    if brand is None:
        raise AppError("NOT_FOUND", "Không tìm thấy thương hiệu", 404)
    return brand


def _ensure_brand_name_available(db: Session, name: str, exclude_id: int | None = None) -> None:
    stmt = select(Brand.id).where(func.lower(Brand.name) == name.lower())
    if exclude_id is not None:
        stmt = stmt.where(Brand.id != exclude_id)
    if db.scalar(stmt) is not None:
        raise _DUPLICATE_BRAND


def create_brand(db: Session, data: BrandCreate, actor: User, ip: str | None) -> Brand:
    _ensure_brand_name_available(db, data.name)
    brand = Brand(name=data.name)
    db.add(brand)
    db.flush()
    audit_service.record(
        db,
        action="BRAND_CREATE",
        user_id=actor.id,
        entity_type="brand",
        entity_id=brand.id,
        new_values={"name": brand.name},
        ip_address=ip,
    )
    _commit(db, _DUPLICATE_BRAND)
    return brand


def update_brand(db: Session, brand_id: int, changes: dict, actor: User, ip: str | None) -> Brand:
    brand = get_brand(db, brand_id)
    before = {"name": brand.name, "is_active": brand.is_active}
    changes = {k: v for k, v in changes.items() if v is not None}
    if "name" in changes and changes["name"].lower() != brand.name.lower():
        _ensure_brand_name_available(db, changes["name"], exclude_id=brand.id)

    for key, value in changes.items():
        setattr(brand, key, value)
    _audit_diff(
        db,
        action="BRAND_UPDATE",
        actor=actor,
        entity_type="brand",
        entity_id=brand.id,
        before=before,
        after={"name": brand.name, "is_active": brand.is_active},
        ip=ip,
    )
    _commit(db, _DUPLICATE_BRAND)
    return brand
