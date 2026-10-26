import csv
import io
from collections.abc import Iterable, Sequence
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from fastapi.responses import Response

from app.utils.time import VN_TZ

# Ô bắt đầu bằng các ký tự này bị Excel hiểu là công thức (CSV injection, ví dụ tên SP "=HYPERLINK(...)")
_FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")


def _cell(value: Any) -> Any:
    if isinstance(value, str):
        return "'" + value if value.startswith(_FORMULA_PREFIXES) else value
    if isinstance(value, datetime):
        return value.astimezone(VN_TZ).strftime("%d/%m/%Y %H:%M")
    if isinstance(value, date):
        return value.strftime("%d/%m/%Y")
    if isinstance(value, Decimal):
        return format(value, "f")
    if isinstance(value, bool):
        return "Có" if value else "Không"
    if value is None:
        return ""
    return value


def csv_response(filename: str, headers: Sequence[str], rows: Iterable[Sequence[Any]]) -> Response:
    """
    Trả file CSV UTF-8 có BOM: Excel trên Windows mới nhận đúng tiếng Việt khi mở trực tiếp.
    Số tiền giữ dạng số thuần (không dấu chấm phân cách) để Excel tính toán được.
    """
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(headers)
    for row in rows:
        writer.writerow([_cell(value) for value in row])
    return Response(
        content="﻿" + buffer.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
