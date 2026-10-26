from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Identity,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.catalog import Product
from app.models.user import User


class TransactionType:
    PURCHASE = "PURCHASE"
    SALE = "SALE"
    SALE_RETURN = "SALE_RETURN"
    ORDER_CANCEL = "ORDER_CANCEL"
    ADJUSTMENT = "ADJUSTMENT"

    ALL = (PURCHASE, SALE, SALE_RETURN, ORDER_CANCEL, ADJUSTMENT)


class InventoryTransaction(Base):
    """Sổ cái kho: mỗi thay đổi tồn kho là một dòng. Chỉ thêm, không sửa/xóa."""

    __tablename__ = "inventory_transactions"
    __table_args__ = (
        CheckConstraint(
            "type IN ('PURCHASE', 'SALE', 'SALE_RETURN', 'ORDER_CANCEL', 'ADJUSTMENT')", name="type_valid"
        ),
        CheckConstraint("quantity_change <> 0", name="quantity_change_non_zero"),
        CheckConstraint("quantity_after >= 0", name="quantity_after_non_negative"),
        Index("ix_inventory_transactions_product_created", "product_id", "created_at"),
        Index("ix_inventory_transactions_type_created", "type", "created_at"),
        Index("ix_inventory_transactions_reference", "reference_type", "reference_id"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    product_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("products.id"), nullable=False)
    type: Mapped[str] = mapped_column(String(20), nullable=False)
    quantity_change: Mapped[int] = mapped_column(Integer, nullable=False)
    quantity_after: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_cost: Mapped[Decimal] = mapped_column(Numeric(15, 4), nullable=False)
    avg_cost_after: Mapped[Decimal] = mapped_column(Numeric(15, 4), nullable=False)
    reference_type: Mapped[str] = mapped_column(String(30), nullable=False)
    reference_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    note: Mapped[str | None] = mapped_column(String(255))
    created_by: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    product: Mapped[Product] = relationship(lazy="joined")
    creator: Mapped[User] = relationship(lazy="joined")


class AdjustmentType:
    ADJUSTMENT = "ADJUSTMENT"
    STOCKTAKE = "STOCKTAKE"


class StockAdjustment(Base):
    __tablename__ = "stock_adjustments"
    __table_args__ = (CheckConstraint("type IN ('ADJUSTMENT', 'STOCKTAKE')", name="type_valid"),)

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    code: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    type: Mapped[str] = mapped_column(String(20), nullable=False)
    reason: Mapped[str] = mapped_column(String(255), nullable=False)
    note: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )

    creator: Mapped[User] = relationship(lazy="joined")
    items: Mapped[list["StockAdjustmentItem"]] = relationship(
        back_populates="adjustment",
        cascade="all, delete-orphan",
        order_by="StockAdjustmentItem.id",
        lazy="selectin",
    )


class StockAdjustmentItem(Base):
    __tablename__ = "stock_adjustment_items"
    __table_args__ = (
        UniqueConstraint(
            "stock_adjustment_id", "product_id", name="uq_stock_adjustment_items_adjustment_product"
        ),
        CheckConstraint("quantity_change <> 0", name="quantity_change_non_zero"),
        CheckConstraint("quantity_before >= 0", name="quantity_before_non_negative"),
        CheckConstraint("counted_quantity IS NULL OR counted_quantity >= 0", name="counted_non_negative"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    stock_adjustment_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("stock_adjustments.id", ondelete="CASCADE"), nullable=False
    )
    product_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("products.id"), nullable=False)
    quantity_before: Mapped[int] = mapped_column(Integer, nullable=False)
    quantity_change: Mapped[int] = mapped_column(Integer, nullable=False)
    counted_quantity: Mapped[int | None] = mapped_column(Integer)
    unit_cost: Mapped[Decimal] = mapped_column(Numeric(15, 4), nullable=False)

    adjustment: Mapped[StockAdjustment] = relationship(back_populates="items")
    product: Mapped[Product] = relationship(lazy="joined")
