"""Nghiệp vụ sản phẩm. Tồn kho/giá vốn KHÔNG được sửa ở đây — chỉ đọc từ bảng inventory."""

import logging
import uuid

from sqlalchemy import and_, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import AppError
from app.models import Brand, Category, Inventory, Product, ProductKind, User
from app.schemas.catalog import ProductCreate, ProductOut
from app.services import audit_service, recipe_service
from app.utils.pagination import apply_sort, paginate

logger = logging.getLogger(__name__)

SORTABLE_FIELDS = {
    "name": Product.name,
    "sku": Product.sku,
    "sale_price": Product.sale_price,
    "quantity": Inventory.quantity,
    "created_at": Product.created_at,
}

_AUDITED_FIELDS = (
    "sku",
    "barcode",
    "name",
    "category_id",
    "brand_id",
    "unit",
    "sale_price",
    "min_stock",
    "description",
    "is_active",
    "purchase_unit",
    "purchase_factor",
)

_DUPLICATE_SKU = AppError("DUPLICATE_SKU", "Mã SKU đã tồn tại", 409)
_DUPLICATE_BARCODE = AppError("DUPLICATE_BARCODE", "Mã vạch đã được dùng cho sản phẩm khác", 409)

# Nhận diện định dạng ảnh qua "magic bytes" của nội dung, không tin tên file hay Content-Type do client gửi
_IMAGE_SIGNATURES = (
    (b"\xff\xd8\xff", "jpg"),
    (b"\x89PNG\r\n\x1a\n", "png"),
)


def _field_error(field: str, message: str) -> AppError:
    return AppError("VALIDATION_ERROR", "Dữ liệu không hợp lệ", 422, [{"field": field, "message": message}])


def _recipe_line(line, include_cost: bool) -> dict:
    ingredient = line.ingredient
    ref = {
        "id": ingredient.id,
        "sku": ingredient.sku,
        "name": ingredient.name,
        "unit": ingredient.unit,
        "kind": ingredient.kind,
        "is_active": ingredient.is_active,
        "quantity": ingredient.inventory.quantity,
    }
    if include_cost:
        ref["avg_cost"] = ingredient.inventory.avg_cost
    return {"ingredient": ref, "quantity": line.quantity}


def to_out(product: Product, include_cost: bool) -> ProductOut:
    is_dish = product.kind == ProductKind.DISH
    data = {
        "id": product.id,
        "sku": product.sku,
        "barcode": product.barcode,
        "name": product.name,
        "kind": product.kind,
        "category": product.category,
        "brand": product.brand,
        "unit": product.unit,
        "purchase_unit": product.purchase_unit,
        "purchase_factor": product.purchase_factor,
        "sale_price": product.sale_price,
        "min_stock": product.min_stock,
        "image_url": f"/uploads/{product.image_path}" if product.image_path else None,
        "description": product.description,
        "is_active": product.is_active,
        # Món không có tồn riêng: "tồn" là số phần còn làm được từ nguyên liệu
        "quantity": recipe_service.portions_available(product) if is_dish else product.inventory.quantity,
        "is_low_stock": not is_dish and product.is_active and product.inventory.quantity <= product.min_stock,
        "recipe": [_recipe_line(line, include_cost) for line in product.recipe],
        "created_at": product.created_at,
        "updated_at": product.updated_at,
    }
    # Chỉ đưa giá vốn vào response khi có quyền; route dùng response_model_exclude_unset để bỏ hẳn trường này
    if include_cost:
        data["avg_cost"] = recipe_service.estimated_cost(product) if is_dish else product.inventory.avg_cost
    return ProductOut.model_validate(data, from_attributes=True)


def search_condition(q: str):
    """Tìm theo tên (chứa), SKU (bắt đầu bằng) hoặc mã vạch (khớp chính xác — phù hợp máy quét)."""
    q = q.strip()
    return or_(
        Product.name.icontains(q, autoescape=True),
        Product.sku.istartswith(q, autoescape=True),
        Product.barcode == q,
    )


def list_products(
    db: Session,
    *,
    q: str | None,
    category_id: int | None,
    brand_id: int | None,
    is_active: bool | None,
    low_stock: bool | None,
    page: int,
    kind: str | None = None,
    sellable: bool | None = None,
    stocked: bool | None = None,
    page_size: int,
    sort: str | None,
) -> tuple[list[Product], int]:
    stmt = select(Product).join(Inventory, Inventory.product_id == Product.id)
    if q:
        stmt = stmt.where(search_condition(q))
    if category_id is not None:
        # Lọc theo danh mục cha thì lấy luôn sản phẩm của các danh mục con
        child_ids = select(Category.id).where(
            or_(Category.id == category_id, Category.parent_id == category_id)
        )
        stmt = stmt.where(Product.category_id.in_(child_ids))
    if brand_id is not None:
        stmt = stmt.where(Product.brand_id == brand_id)
    if is_active is not None:
        stmt = stmt.where(Product.is_active.is_(is_active))
    if kind is not None:
        stmt = stmt.where(Product.kind == kind)
    if sellable is not None:
        is_ingredient = Product.kind == ProductKind.INGREDIENT
        stmt = stmt.where(~is_ingredient if sellable else is_ingredient)
    if stocked is not None:
        is_dish = Product.kind == ProductKind.DISH
        stmt = stmt.where(~is_dish if stocked else is_dish)
    if low_stock:
        stmt = stmt.where(low_stock_condition())
    stmt = apply_sort(stmt, sort, SORTABLE_FIELDS, default="-created_at")
    return paginate(db, stmt, page, page_size)


def low_stock_condition():
    """Sắp hết hàng: chỉ sản phẩm có tồn kho thật (món ăn không có tồn riêng). Cần join Inventory."""
    return and_(
        Product.is_active.is_(True),
        Product.kind != ProductKind.DISH,
        Inventory.quantity <= Product.min_stock,
    )


def _validate_units(kind: str, purchase_unit: str | None, purchase_factor: int) -> None:
    if kind == ProductKind.DISH and (purchase_unit is not None or purchase_factor != 1):
        raise _field_error("purchase_factor", "Món ăn không nhập hàng nên không có đơn vị nhập")
    if purchase_factor > 1 and purchase_unit is None:
        raise _field_error("purchase_unit", "Nhập tên đơn vị nhập (vd. kg, thùng)")
    if purchase_factor == 1 and purchase_unit is not None:
        raise _field_error("purchase_factor", "Đơn vị nhập phải lớn hơn 1 đơn vị kho (vd. 1 kg = 1000 g)")


def get_product(db: Session, product_id: int) -> Product:
    product = db.get(Product, product_id)
    if product is None:
        raise AppError("NOT_FOUND", "Không tìm thấy sản phẩm", 404)
    return product


def _ensure_unique(db: Session, sku: str | None, barcode: str | None, exclude_id: int | None = None) -> None:
    def taken(column, value) -> bool:
        stmt = select(Product.id).where(column == value)
        if exclude_id is not None:
            stmt = stmt.where(Product.id != exclude_id)
        return db.scalar(stmt) is not None

    if sku is not None and taken(Product.sku, sku):
        raise _DUPLICATE_SKU
    if barcode is not None and taken(Product.barcode, barcode):
        raise _DUPLICATE_BARCODE


def _active_category(db: Session, category_id: int) -> Category:
    category = db.get(Category, category_id)
    if category is None or not category.is_active:
        raise _field_error("category_id", "Danh mục không tồn tại hoặc đã ngừng sử dụng")
    return category


def _active_brand(db: Session, brand_id: int) -> Brand:
    brand = db.get(Brand, brand_id)
    if brand is None or not brand.is_active:
        raise _field_error("brand_id", "Thương hiệu không tồn tại hoặc đã ngừng sử dụng")
    return brand


def _commit(db: Session) -> None:
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        constraint = getattr(getattr(exc.orig, "diag", None), "constraint_name", "") or ""
        if constraint == "uq_products_sku":
            raise _DUPLICATE_SKU from exc
        if constraint == "uq_products_barcode":
            raise _DUPLICATE_BARCODE from exc
        raise


def create_product(db: Session, data: ProductCreate, actor: User, ip: str | None) -> Product:
    _ensure_unique(db, data.sku, data.barcode)
    _active_category(db, data.category_id)
    if data.brand_id is not None:
        _active_brand(db, data.brand_id)
    _validate_units(data.kind, data.purchase_unit, data.purchase_factor)
    if data.kind == ProductKind.DISH:
        data.min_stock = 0  # món không có tồn riêng → không cảnh báo sắp hết

    product = Product(**data.model_dump(), created_by=actor.id)
    # Mỗi sản phẩm có sẵn một dòng tồn kho = 0, tạo trong cùng transaction
    product.inventory = Inventory(quantity=0, avg_cost=0)
    db.add(product)
    db.flush()
    audit_service.record(
        db,
        action="PRODUCT_CREATE",
        user_id=actor.id,
        entity_type="product",
        entity_id=product.id,
        new_values=data.model_dump(),
        ip_address=ip,
    )
    _commit(db)
    db.refresh(product)
    return product


def update_product(db: Session, product_id: int, changes: dict, actor: User, ip: str | None) -> Product:
    product = get_product(db, product_id)
    before = {k: getattr(product, k) for k in _AUDITED_FIELDS}

    # Các trường bắt buộc: gửi null thì coi như không đổi (barcode/brand/description null = xóa giá trị)
    for required in (
        "sku",
        "name",
        "category_id",
        "unit",
        "sale_price",
        "min_stock",
        "is_active",
        "purchase_factor",
    ):
        if changes.get(required, ...) is None:
            changes.pop(required)

    _ensure_unique(db, changes.get("sku"), changes.get("barcode"), exclude_id=product.id)
    if "category_id" in changes and changes["category_id"] != product.category_id:
        _active_category(db, changes["category_id"])
    if changes.get("brand_id") is not None and changes["brand_id"] != product.brand_id:
        _active_brand(db, changes["brand_id"])
    if "purchase_unit" in changes or "purchase_factor" in changes:
        _validate_units(
            product.kind,
            changes.get("purchase_unit", product.purchase_unit),
            changes.get("purchase_factor") or product.purchase_factor,
        )
    if product.kind == ProductKind.DISH:
        changes.pop("min_stock", None)
    if changes.get("is_active") is True and not product.is_active:
        category = db.get(Category, changes.get("category_id", product.category_id))
        if not category.is_active:
            raise AppError("CATEGORY_INACTIVE", "Danh mục của sản phẩm đã ngừng sử dụng", 409)

    for key, value in changes.items():
        setattr(product, key, value)

    after = {k: getattr(product, k) for k in _AUDITED_FIELDS}
    changed = [k for k in _AUDITED_FIELDS if before[k] != after[k]]
    if changed:
        audit_service.record(
            db,
            action="PRODUCT_UPDATE",
            user_id=actor.id,
            entity_type="product",
            entity_id=product.id,
            old_values={k: before[k] for k in changed},
            new_values={k: after[k] for k in changed},
            ip_address=ip,
        )
    _commit(db)
    db.refresh(product)
    return product


def detect_image_extension(content: bytes) -> str | None:
    for signature, extension in _IMAGE_SIGNATURES:
        if content.startswith(signature):
            return extension
    if len(content) >= 12 and content[:4] == b"RIFF" and content[8:12] == b"WEBP":
        return "webp"
    return None


def save_image(db: Session, product_id: int, content: bytes, actor: User, ip: str | None) -> Product:
    settings = get_settings()
    product = get_product(db, product_id)

    if len(content) > settings.max_image_bytes:
        raise AppError("FILE_TOO_LARGE", f"Ảnh tối đa {settings.max_image_bytes // (1024 * 1024)}MB", 413)
    extension = detect_image_extension(content)
    if extension is None:
        raise AppError("FILE_INVALID", "Chỉ chấp nhận ảnh JPEG, PNG hoặc WebP", 422)

    # Tên file ngẫu nhiên do server đặt: không dùng tên file của client (tránh path traversal, ghi đè)
    relative_path = f"products/{uuid.uuid4().hex}.{extension}"
    target = settings.upload_dir / relative_path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(content)

    old_path = product.image_path
    product.image_path = relative_path
    audit_service.record(
        db,
        action="PRODUCT_IMAGE_UPDATE",
        user_id=actor.id,
        entity_type="product",
        entity_id=product.id,
        old_values={"image_path": old_path},
        new_values={"image_path": relative_path},
        ip_address=ip,
    )
    try:
        db.commit()
    except Exception:
        target.unlink(missing_ok=True)  # DB lỗi thì không để lại file mồ côi
        raise

    if old_path:
        try:
            (settings.upload_dir / old_path).unlink(missing_ok=True)
        except OSError:
            logger.warning("Không xóa được ảnh cũ %s", old_path)
    db.refresh(product)
    return product
