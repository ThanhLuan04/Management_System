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
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin
from app.models.catalog import Product
from app.models.partner import Supplier
from app.models.user import User


class PurchaseStatus:
    DRAFT = "DRAFT"
    CONFIRMED = "CONFIRMED"
    CANCELLED = "CANCELLED"


class PurchaseOrder(TimestampMixin, Base):
    """Phiếu nhập. Chỉ khi CONFIRMED mới cộng tồn kho; sau đó không được sửa."""

    __tablename__ = "purchase_orders"
    __table_args__ = (
        CheckConstraint("status IN ('DRAFT', 'CONFIRMED', 'CANCELLED')", name="status_valid"),
        CheckConstraint("total_amount >= 0", name="total_non_negative"),
        # Trạng thái và thời điểm xác nhận luôn đi cùng nhau
        CheckConstraint("(status = 'CONFIRMED') = (confirmed_at IS NOT NULL)", name="confirmed_consistent"),
        Index("ix_purchase_orders_status_created", "status", "created_at"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    code: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    supplier_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("suppliers.id"), nullable=False, index=True
    )
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default=PurchaseStatus.DRAFT)
    total_amount: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)
    note: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"), nullable=False)
    confirmed_by: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("users.id"))
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancelled_by: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("users.id"))
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    supplier: Mapped[Supplier] = relationship(lazy="joined")
    creator: Mapped[User] = relationship(foreign_keys=[created_by], lazy="joined")
    confirmer: Mapped[User | None] = relationship(foreign_keys=[confirmed_by], lazy="joined")
    items: Mapped[list["PurchaseOrderItem"]] = relationship(
        back_populates="purchase_order",
        cascade="all, delete-orphan",
        order_by="PurchaseOrderItem.id",
        lazy="selectin",
    )


class PurchaseOrderItem(Base):
    __tablename__ = "purchase_order_items"
    __table_args__ = (
        UniqueConstraint("purchase_order_id", "product_id", name="uq_purchase_order_items_order_product"),
        CheckConstraint("quantity > 0", name="quantity_positive"),
        CheckConstraint("unit_cost >= 0", name="unit_cost_non_negative"),
        CheckConstraint(
            "discount_amount >= 0 AND discount_amount <= quantity * unit_cost", name="discount_valid"
        ),
        CheckConstraint("line_total = quantity * unit_cost - discount_amount", name="line_total_consistent"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    purchase_order_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("purchase_orders.id", ondelete="CASCADE"), nullable=False
    )
    product_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("products.id"), nullable=False, index=True)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_cost: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)
    discount_amount: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False, server_default="0")
    line_total: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)

    purchase_order: Mapped[PurchaseOrder] = relationship(back_populates="items")
    product: Mapped[Product] = relationship(lazy="joined")
