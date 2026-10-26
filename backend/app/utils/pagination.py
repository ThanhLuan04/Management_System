from collections.abc import Mapping
from typing import Any

from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session

from app.core.errors import AppError


def apply_sort(stmt: Select, sort: str | None, allowed: Mapping[str, Any], default: str) -> Select:
    """
    Sắp xếp theo tham số `sort` dạng "name" hoặc "-created_at".
    Chỉ chấp nhận trường trong whitelist `allowed` để không thể sắp xếp theo cột tùy ý.
    """
    sort = sort or default
    descending = sort.startswith("-")
    field = sort.lstrip("-")
    if field not in allowed:
        raise AppError(
            "VALIDATION_ERROR",
            "Dữ liệu không hợp lệ",
            422,
            [{"field": "sort", "message": f"Chỉ hỗ trợ sắp xếp theo: {', '.join(sorted(allowed))}"}],
        )
    column = allowed[field]
    return stmt.order_by(column.desc() if descending else column.asc())


def paginate(db: Session, stmt: Select, page: int, page_size: int) -> tuple[list, int]:
    total = db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    items = list(db.scalars(stmt.offset((page - 1) * page_size).limit(page_size)).unique())
    return items, total
