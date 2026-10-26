from datetime import date

from app.core.errors import AppError


def validate_date_range(date_from: date | None, date_to: date | None, max_days: int | None = None) -> None:
    if date_from and date_to and date_from > date_to:
        raise AppError(
            "VALIDATION_ERROR",
            "Dữ liệu không hợp lệ",
            422,
            [{"field": "date_from", "message": "Ngày bắt đầu phải trước hoặc bằng ngày kết thúc"}],
        )
    if max_days and date_from and date_to and (date_to - date_from).days + 1 > max_days:
        raise AppError(
            "VALIDATION_ERROR",
            "Dữ liệu không hợp lệ",
            422,
            [{"field": "date_to", "message": f"Khoảng thời gian tối đa {max_days} ngày"}],
        )
