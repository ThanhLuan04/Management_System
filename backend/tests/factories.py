"""Tạo dữ liệu nền cho test trực tiếp qua DB (nhanh hơn gọi API khi dữ liệu không phải đối tượng cần kiểm tra)."""

from decimal import Decimal

from sqlalchemy.orm import Session

from app.models import Category, Inventory, Product, Supplier


def make_category(db: Session, name: str = "Đồ uống") -> Category:
    category = Category(name=name)
    db.add(category)
    db.commit()
    return category


def make_product(
    db: Session,
    category: Category,
    sku: str,
    *,
    sale_price: str = "10000",
    min_stock: int = 0,
    is_active: bool = True,
) -> Product:
    product = Product(
        sku=sku,
        name=f"Sản phẩm {sku}",
        category_id=category.id,
        unit="cái",
        sale_price=Decimal(sale_price),
        min_stock=min_stock,
        is_active=is_active,
    )
    product.inventory = Inventory(quantity=0, avg_cost=Decimal("0"))
    db.add(product)
    db.commit()
    return product


def set_stock(db: Session, product: Product, quantity: int, avg_cost: str) -> None:
    """Đặt tồn kho trực tiếp cho test bán hàng (bỏ qua bước nhập hàng — đã có test riêng)."""
    inventory = db.get(Inventory, product.id)
    inventory.quantity = quantity
    inventory.avg_cost = Decimal(avg_cost)
    db.commit()


def make_supplier(db: Session, name: str = "Nhà cung cấp A", code: str = "NCC0001") -> Supplier:
    supplier = Supplier(code=code, name=name)
    db.add(supplier)
    db.commit()
    return supplier
