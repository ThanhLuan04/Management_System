from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

# Múi giờ nghiệp vụ: "ngày bán", "ngày nhập", mã chứng từ, báo cáo đều tính theo giờ Việt Nam
VN_TZ = ZoneInfo("Asia/Ho_Chi_Minh")


def utcnow() -> datetime:
    """Thời điểm hiện tại có múi giờ UTC. DB lưu TIMESTAMPTZ nên luôn dùng datetime có tzinfo."""
    return datetime.now(UTC)


def vn_today() -> date:
    return datetime.now(VN_TZ).date()


def vn_date_of(moment: datetime) -> date:
    return moment.astimezone(VN_TZ).date()


def vn_day_range(date_from: date | None, date_to: date | None) -> tuple[datetime | None, datetime | None]:
    """
    Đổi khoảng ngày (theo giờ VN, gồm cả hai đầu) thành [start, end) dạng datetime có múi giờ để lọc cột TIMESTAMPTZ.
    Ví dụ ngày 25/10 → [25/10 00:00 +07:00, 26/10 00:00 +07:00).
    """
    start = datetime.combine(date_from, time.min, tzinfo=VN_TZ) if date_from else None
    end = datetime.combine(date_to + timedelta(days=1), time.min, tzinfo=VN_TZ) if date_to else None
    return start, end
