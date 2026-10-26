from datetime import UTC, datetime


def utcnow() -> datetime:
    """Thời điểm hiện tại có múi giờ UTC. DB lưu TIMESTAMPTZ nên luôn dùng datetime có tzinfo."""
    return datetime.now(UTC)
