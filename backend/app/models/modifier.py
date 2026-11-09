"""
Tùy chọn món (size, topping…): nhóm tùy chọn dùng chung cho nhiều món.

- Nhóm có số lựa chọn tối thiểu / tối đa: Size (chọn đúng 1), Topping (chọn 0–3).
- Lựa chọn có giá cộng thêm (có thể âm: "Không thịt −10.000") và nguyên liệu trừ thêm (Thêm trứng: 1 quả).
- Lựa chọn không bao giờ bị xóa khỏi DB — chỉ ngừng dùng — vì dòng đơn cũ tham chiếu tới nó.
"""

from decimal import Decimal

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    ForeignKey,
    Identity,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin
from app.models.catalog import Product


class ModifierGroup(TimestampMixin, Base):
    __tablename__ = "modifier_groups"
    __table_args__ = (
        CheckConstraint("min_select >= 0", name="min_select_non_negative"),
        CheckConstraint("max_select >= 1 AND max_select >= min_select", name="max_select_valid"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    min_select: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    max_select: Mapped[int] = mapped_column(Integer, nullable=False, server_default="1")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")

    options: Mapped[list["ModifierOption"]] = relationship(
        back_populates="group",
        order_by="(ModifierOption.sort_order, ModifierOption.id)",
        lazy="selectin",
    )


class ModifierOption(Base):
    __tablename__ = "modifier_options"
    __table_args__ = (
        CheckConstraint("price_delta BETWEEN -999999999 AND 999999999", name="price_delta_range"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    group_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("modifier_groups.id"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    price_delta: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False, server_default="0")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")

    group: Mapped[ModifierGroup] = relationship(back_populates="options")
    ingredients: Mapped[list["ModifierOptionIngredient"]] = relationship(
        cascade="all, delete-orphan", order_by="ModifierOptionIngredient.id", lazy="selectin"
    )


class ModifierOptionIngredient(Base):
    """Nguyên liệu trừ thêm cho 1 phần khi khách chọn lựa chọn này (đơn vị kho của nguyên liệu)."""

    __tablename__ = "modifier_option_ingredients"
    __table_args__ = (
        UniqueConstraint(
            "option_id", "ingredient_id", name="uq_modifier_option_ingredients_option_ingredient"
        ),
        CheckConstraint("quantity > 0", name="quantity_positive"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    option_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("modifier_options.id", ondelete="CASCADE"), nullable=False, index=True
    )
    ingredient_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("products.id"), nullable=False, index=True
    )
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)

    ingredient: Mapped[Product] = relationship(lazy="joined")


class ProductModifierGroup(Base):
    """Món nào dùng nhóm tùy chọn nào (một nhóm gắn được vào nhiều món)."""

    __tablename__ = "product_modifier_groups"

    product_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("products.id", ondelete="CASCADE"), primary_key=True
    )
    group_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("modifier_groups.id"), primary_key=True, index=True
    )
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")

    group: Mapped[ModifierGroup] = relationship(lazy="joined")
