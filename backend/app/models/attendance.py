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


class TimeEntry(Base):
    """
    Một lượt chấm công: vào ca → ra ca. Mỗi nhân viên chỉ có MỘT lượt đang mở (unique index một phần).
    hourly_rate được chốt lúc vào ca (đổi mức lương sau này không làm sai bảng công cũ).
    """

    __tablename__ = "time_entries"
    __table_args__ = (
        CheckConstraint("clock_out_at IS NULL OR clock_out_at > clock_in_at", name="clock_out_after_in"),
        CheckConstraint("hourly_rate >= 0", name="hourly_rate_non_negative"),
        Index(
            "uq_time_entries_one_open_per_user",
            "user_id",
            unique=True,
            postgresql_where=text("clock_out_at IS NULL"),
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"), nullable=False, index=True)
    clock_in_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    clock_out_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    hourly_rate: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, server_default="0")
    # Có giá trị khi quản lý thêm / sửa tay (vd. "Quên bấm ra ca") — kèm người sửa
    note: Mapped[str | None] = mapped_column(String(255))
    edited_by: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    user: Mapped[User] = relationship(foreign_keys=[user_id], lazy="joined")
    editor: Mapped[User | None] = relationship(foreign_keys=[edited_by], lazy="joined")
