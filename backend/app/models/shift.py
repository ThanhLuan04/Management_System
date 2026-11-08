from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Identity,
    Index,
    Numeric,
    String,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.user import User


class ShiftStatus:
    OPEN = "OPEN"
    CLOSED = "CLOSED"


class CashShift(Base):
    """
    Ca làm việc của két tiền chung: mở ca (tiền đầu ca) → bán hàng/hoàn tiền gắn vào ca → đóng ca (đếm két).
    Mỗi lúc chỉ có MỘT ca đang mở cho cả cửa hàng (unique index một phần bên dưới).
    expected_cash / difference được tính và lưu lúc đóng ca (số liệu chốt, không đổi về sau).
    """

    __tablename__ = "cash_shifts"
    __table_args__ = (
        CheckConstraint("status IN ('OPEN', 'CLOSED')", name="status_valid"),
        CheckConstraint("opening_cash >= 0", name="opening_cash_non_negative"),
        CheckConstraint("counted_cash IS NULL OR counted_cash >= 0", name="counted_cash_non_negative"),
        CheckConstraint(
            "(status = 'OPEN' AND closed_at IS NULL) OR "
            "(status = 'CLOSED' AND closed_at IS NOT NULL AND counted_cash IS NOT NULL AND expected_cash IS NOT NULL)",
            name="closing_fields_consistent",
        ),
        # Chỉ một dòng được có status = 'OPEN' → database chặn hai người mở ca cùng lúc
        Index("uq_cash_shifts_single_open", "status", unique=True, postgresql_where=text("status = 'OPEN'")),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    code: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    status: Mapped[str] = mapped_column(String(10), nullable=False)
    opening_cash: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)
    opened_by: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"), nullable=False)
    opened_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    counted_cash: Mapped[Decimal | None] = mapped_column(Numeric(15, 2))
    expected_cash: Mapped[Decimal | None] = mapped_column(Numeric(15, 2))
    difference: Mapped[Decimal | None] = mapped_column(Numeric(15, 2))
    close_note: Mapped[str | None] = mapped_column(String(500))
    closed_by: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("users.id"))
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)

    opener: Mapped[User] = relationship(foreign_keys=[opened_by], lazy="joined")
    closer: Mapped[User | None] = relationship(foreign_keys=[closed_by], lazy="joined")
