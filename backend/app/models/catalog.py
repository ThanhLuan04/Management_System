from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Identity,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


class Category(TimestampMixin, Base):
    __tablename__ = "categories"
    __table_args__ = (CheckConstraint("parent_id <> id", name="not_own_parent"),)

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    parent_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("categories.id"))
    description: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")

    parent: Mapped["Category | None"] = relationship(remote_side=[id], lazy="joined")


# Tên danh mục duy nhất trong cùng một cha (không phân biệt hoa thường); danh mục gốc coi như cha = 0
Index(
    "uq_categories_parent_name", func.coalesce(Category.parent_id, 0), func.lower(Category.name), unique=True
)


class Brand(TimestampMixin, Base):
    __tablename__ = "brands"

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")


Index("uq_brands_name_lower", func.lower(Brand.name), unique=True)


class Product(TimestampMixin, Base):
    """Thông tin hàng hóa. KHÔNG chứa tồn kho/giá vốn — hai giá trị đó thuộc bảng inventory."""

    __tablename__ = "products"
    __table_args__ = (
        CheckConstraint("sale_price >= 0", name="sale_price_non_negative"),
        CheckConstraint("min_stock >= 0", name="min_stock_non_negative"),
        # Tìm kiếm ILIKE '%...%' theo tên nhanh nhờ chỉ mục trigram
        Index(
            "ix_products_name_trgm", "name", postgresql_using="gin", postgresql_ops={"name": "gin_trgm_ops"}
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    sku: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    barcode: Mapped[str | None] = mapped_column(String(50), unique=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    category_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("categories.id"), nullable=False, index=True
    )
    brand_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("brands.id"), index=True)
    unit: Mapped[str] = mapped_column(String(20), nullable=False)
    sale_price: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)
    min_stock: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    image_path: Mapped[str | None] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true", index=True)
    created_by: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("users.id"))

    category: Mapped[Category] = relationship(lazy="joined")
    brand: Mapped[Brand | None] = relationship(lazy="joined")
    inventory: Mapped["Inventory"] = relationship(back_populates="product", lazy="joined", uselist=False)


class Inventory(Base):
    """Tồn kho hiện tại của từng sản phẩm — dòng được khóa (FOR UPDATE) khi nhập/bán đồng thời."""

    __tablename__ = "inventory"
    __table_args__ = (
        CheckConstraint("quantity >= 0", name="quantity_non_negative"),
        CheckConstraint("avg_cost >= 0", name="avg_cost_non_negative"),
    )

    product_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("products.id"), primary_key=True)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    avg_cost: Mapped[Decimal] = mapped_column(Numeric(15, 4), nullable=False, server_default="0")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    product: Mapped[Product] = relationship(back_populates="inventory")
