"""
Sinh mã tuần tự cho danh mục (NCC0001, KH000001) và chứng từ (PN20261025-0001, HD..., TH..., DC...).

Dùng một câu lệnh INSERT ... ON CONFLICT DO UPDATE ... RETURNING: PostgreSQL khóa dòng bộ đếm trong lúc cập nhật,
nên nhiều request đồng thời luôn nhận số khác nhau. Câu lệnh chạy trong transaction của nghiệp vụ —
nghiệp vụ rollback thì số cũng được trả lại (không bị "đốt" số).
"""

from datetime import date

from sqlalchemy import text
from sqlalchemy.orm import Session

_NEXT_VALUE = text(
    """
    INSERT INTO code_sequences (prefix, period, last_value) VALUES (:prefix, :period, 1)
    ON CONFLICT (prefix, period) DO UPDATE SET last_value = code_sequences.last_value + 1
    RETURNING last_value
    """
)


def next_value(db: Session, prefix: str, period: str = "ALL") -> int:
    return db.execute(_NEXT_VALUE, {"prefix": prefix, "period": period}).scalar_one()


def master_code(db: Session, prefix: str, width: int) -> str:
    """Mã danh mục không theo ngày, ví dụ master_code(db, 'KH', 6) → 'KH000001'."""
    return f"{prefix}{next_value(db, prefix):0{width}d}"


def document_code(db: Session, prefix: str, business_date: date) -> str:
    """Mã chứng từ đánh số lại mỗi ngày, ví dụ 'HD20261025-0001'."""
    period = business_date.strftime("%Y%m%d")
    return f"{prefix}{period}-{next_value(db, prefix, period):04d}"
