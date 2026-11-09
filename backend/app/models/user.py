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
    Numeric,
    SmallInteger,
    String,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


class Role(Base):
    __tablename__ = "roles"

    id: Mapped[int] = mapped_column(SmallInteger, primary_key=True)
    code: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(50), nullable=False)


class User(TimestampMixin, Base):
    __tablename__ = "users"
    __table_args__ = (CheckConstraint("failed_login_count >= 0", name="failed_login_count_non_negative"),)

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    username: Mapped[str] = mapped_column(String(50), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(100), nullable=False)
    email: Mapped[str | None] = mapped_column(String(255))
    phone: Mapped[str | None] = mapped_column(String(20))
    role_id: Mapped[int] = mapped_column(SmallInteger, ForeignKey("roles.id"), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    failed_login_count: Mapped[int] = mapped_column(SmallInteger, nullable=False, server_default="0")
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Lương theo giờ dùng cho chấm công (Admin đặt); null = chưa đặt
    hourly_rate: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))

    # Vai trò luôn cần khi kiểm tra quyền nên nạp kèm user
    role: Mapped[Role] = relationship(lazy="joined")


# Username/email duy nhất không phân biệt hoa thường
Index("uq_users_username_lower", func.lower(User.username), unique=True)
Index("uq_users_email_lower", func.lower(User.email), unique=True)


class PasswordResetCode(Base):
    """Mã 6 số khôi phục mật khẩu gửi qua email: chỉ lưu HMAC, có hạn, giới hạn số lần nhập sai, dùng một lần."""

    __tablename__ = "password_reset_codes"
    __table_args__ = (CheckConstraint("failed_attempts >= 0", name="failed_attempts_non_negative"),)

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # HMAC-SHA256 (khóa bí mật của server) của "user_id:mã" — mã chỉ có 10^6 khả năng nên không dùng SHA-256 trần
    code_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    failed_attempts: Mapped[int] = mapped_column(SmallInteger, nullable=False, server_default="0")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # SHA-256 (hex) của token; token gốc chỉ nằm trong cookie của người dùng
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    user_agent: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
