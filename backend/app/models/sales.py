import uuid
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
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.partner import Customer
from app.models.user import User


class OrderStatus:
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"


class PaymentMethod:
    CASH = "CASH"
    BANK_TRANSFER = "BANK_TRANSFER"
    CARD = "CARD"


class SalesOrder(Base):
    """
    Đơn bán tại quầy: tạo xong là đã thanh toán đủ (COMPLETED). Tiền do backend tính, lưu lại như chứng từ.
    created_at chính là thời điểm bán — dùng để tính doanh thu theo ngày.
    """

    __tablename__ = "sales_orders"
    __table_args__ = (
        CheckConstraint("status IN ('COMPLETED', 'CANCELLED')", name="status_valid"),
        CheckConstraint(
            "discount_type IS NULL OR discount_type IN ('AMOUNT', 'PERCENT')", name="discount_type_valid"
        ),
        CheckConstraint("subtotal >= 0", name="subtotal_non_negative"),
        CheckConstraint("discount_amount >= 0 AND discount_amount <= subtotal", name="discount_valid"),
        CheckConstraint("total_amount = subtotal - discount_amount", name="total_consistent"),
        CheckConstraint("(status = 'CANCELLED') = (cancelled_at IS NOT NULL)", name="cancelled_consistent"),
        Index("ix_sales_orders_created_at", "created_at"),
        Index("ix_sales_orders_status_created", "status", "created_at"),
        Index("ix_sales_orders_customer_created", "customer_id", "created_at"),
        Index("ix_sales_orders_creator_created", "created_by", "created_at"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    code: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    # Chống tạo đơn trùng khi bấm nhiều lần / gửi lại request: mỗi giỏ hàng có một key duy nhất
    idempotency_key: Mapped[uuid.UUID] = mapped_column(Uuid, unique=True, nullable=False)
    # SHA-256 nội dung request: phát hiện dùng lại key cho một giỏ hàng khác
    request_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    customer_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("customers.id"))
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    subtotal: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)
    discount_type: Mapped[str | None] = mapped_column(String(10))
    discount_value: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False, server_default="0")
    discount_amount: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)
    total_amount: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)
    note: Mapped[str | None] = mapped_column(String(500))
    created_by: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    cancelled_by: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("users.id"))
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancel_reason: Mapped[str | None] = mapped_column(String(255))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    customer: Mapped[Customer | None] = relationship(lazy="joined")
    creator: Mapped[User] = relationship(foreign_keys=[created_by], lazy="joined")
    canceller: Mapped[User | None] = relationship(foreign_keys=[cancelled_by], lazy="joined")
    items: Mapped[list["SalesOrderItem"]] = relationship(
        back_populates="order", cascade="all, delete-orphan", order_by="SalesOrderItem.id", lazy="selectin"
    )
    payments: Mapped[list["Payment"]] = relationship(
        back_populates="order", cascade="all, delete-orphan", order_by="Payment.id", lazy="selectin"
    )


class SalesOrderItem(Base):
    """Dòng hàng lưu "ảnh chụp" tại thời điểm bán: tên, SKU, giá bán, giá vốn — không đổi khi sản phẩm đổi giá."""

    __tablename__ = "sales_order_items"
    __table_args__ = (
        UniqueConstraint("sales_order_id", "product_id", name="uq_sales_order_items_order_product"),
        CheckConstraint("quantity > 0", name="quantity_positive"),
        CheckConstraint("unit_price >= 0", name="unit_price_non_negative"),
        CheckConstraint("line_subtotal = quantity * unit_price", name="line_subtotal_consistent"),
        CheckConstraint(
            "discount_allocated >= 0 AND discount_allocated <= line_subtotal", name="discount_allocated_valid"
        ),
        CheckConstraint("line_total = line_subtotal - discount_allocated", name="line_total_consistent"),
        CheckConstraint("unit_cost >= 0", name="unit_cost_non_negative"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    sales_order_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("sales_orders.id", ondelete="CASCADE"), nullable=False
    )
    product_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("products.id"), nullable=False, index=True)
    product_name: Mapped[str] = mapped_column(String(255), nullable=False)
    sku: Mapped[str] = mapped_column(String(50), nullable=False)
    unit: Mapped[str] = mapped_column(String(20), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)
    line_subtotal: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)
    discount_allocated: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)
    line_total: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)
    unit_cost: Mapped[Decimal] = mapped_column(Numeric(15, 4), nullable=False)

    order: Mapped[SalesOrder] = relationship(back_populates="items")


class Payment(Base):
    """Giao dịch tiền: PAYMENT khi bán, REFUND khi hủy đơn / trả hàng. Chỉ ghi nhận, không kết nối ngân hàng."""

    __tablename__ = "payments"
    __table_args__ = (
        CheckConstraint("type IN ('PAYMENT', 'REFUND')", name="type_valid"),
        CheckConstraint("method IN ('CASH', 'BANK_TRANSFER', 'CARD')", name="method_valid"),
        CheckConstraint("amount > 0", name="amount_positive"),
        CheckConstraint(
            "cash_received IS NULL OR (cash_received >= amount AND change_amount = cash_received - amount)",
            name="cash_consistent",
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    sales_order_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("sales_orders.id"), nullable=False, index=True
    )
    type: Mapped[str] = mapped_column(String(10), nullable=False)
    method: Mapped[str] = mapped_column(String(20), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)
    cash_received: Mapped[Decimal | None] = mapped_column(Numeric(15, 2))
    change_amount: Mapped[Decimal | None] = mapped_column(Numeric(15, 2))
    reference_note: Mapped[str | None] = mapped_column(String(100))
    created_by: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    order: Mapped[SalesOrder] = relationship(back_populates="payments")
