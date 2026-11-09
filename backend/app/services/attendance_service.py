"""
Chấm công theo giờ.

- Nhân viên tự bấm vào ca / ra ca (một lượt đang mở mỗi người — unique index trong DB).
- Mức lương/giờ chốt vào lượt lúc vào ca; tiền công = phút làm × lương/giờ ÷ 60, làm tròn đến đồng.
- Quản lý thêm / sửa / xóa lượt khi nhân viên quên chấm: bắt buộc lý do, không được chồng giờ với lượt khác
  của cùng người, ghi nhật ký (giá trị cũ → mới).
"""

from dataclasses import dataclass
from datetime import date, datetime, timedelta
from decimal import Decimal

from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.models import TimeEntry, User
from app.services import audit_service
from app.services.pricing import round_money
from app.utils.pagination import paginate
from app.utils.time import utcnow, vn_day_range

MAX_ENTRY = timedelta(hours=24)
FORGOT_AFTER = timedelta(hours=16)  # lượt mở quá lâu → có thể quên bấm ra ca


def minutes_of(entry: TimeEntry, now: datetime | None = None) -> int:
    end = entry.clock_out_at or now or utcnow()
    return max(0, int((end - entry.clock_in_at).total_seconds() // 60))


def pay_of(minutes: int, rate: Decimal) -> Decimal:
    return round_money(Decimal(minutes) * rate / 60)


def is_forgotten(entry: TimeEntry) -> bool:
    return entry.clock_out_at is None and utcnow() - entry.clock_in_at > FORGOT_AFTER


def open_entry(db: Session, user_id: int) -> TimeEntry | None:
    return db.scalar(select(TimeEntry).where(TimeEntry.user_id == user_id, TimeEntry.clock_out_at.is_(None)))


def clock_in(db: Session, user: User) -> TimeEntry:
    if open_entry(db, user.id) is not None:
        raise AppError("ALREADY_CLOCKED_IN", "Bạn đang trong ca làm — hãy bấm Ra ca trước", 409)
    entry = TimeEntry(user_id=user.id, clock_in_at=utcnow(), hourly_rate=user.hourly_rate or Decimal("0"))
    db.add(entry)
    try:
        db.commit()
    except IntegrityError as exc:  # bấm hai lần cùng lúc: unique index chặn lượt thứ hai
        db.rollback()
        raise AppError("ALREADY_CLOCKED_IN", "Bạn đang trong ca làm — hãy bấm Ra ca trước", 409) from exc
    return entry


def clock_out(db: Session, user: User) -> TimeEntry:
    entry = db.scalar(
        select(TimeEntry)
        .where(TimeEntry.user_id == user.id, TimeEntry.clock_out_at.is_(None))
        .with_for_update(of=TimeEntry)
    )
    if entry is None:
        raise AppError("NOT_CLOCKED_IN", "Bạn chưa bấm Vào ca", 409)
    entry.clock_out_at = utcnow()
    db.commit()
    return entry


def _ensure_valid_range(
    db: Session, user_id: int, clock_in_at: datetime, clock_out_at: datetime | None, exclude_id: int | None
) -> None:
    if clock_out_at is not None:
        if clock_out_at <= clock_in_at:
            raise AppError("INVALID_TIME_RANGE", "Giờ ra phải sau giờ vào", 422)
        if clock_out_at - clock_in_at > MAX_ENTRY:
            raise AppError("INVALID_TIME_RANGE", "Một lượt chấm công tối đa 24 giờ", 422)
    if clock_in_at > utcnow() or (clock_out_at and clock_out_at > utcnow()):
        raise AppError("INVALID_TIME_RANGE", "Không được chấm công cho thời gian trong tương lai", 422)
    end = clock_out_at or datetime.max.replace(tzinfo=clock_in_at.tzinfo)
    overlap = select(TimeEntry.id).where(
        TimeEntry.user_id == user_id,
        TimeEntry.clock_in_at < end,
        or_(TimeEntry.clock_out_at.is_(None), TimeEntry.clock_out_at > clock_in_at),
    )
    if exclude_id is not None:
        overlap = overlap.where(TimeEntry.id != exclude_id)
    if db.scalar(overlap.limit(1)) is not None:
        raise AppError("TIME_OVERLAP", "Khoảng giờ này trùng với một lượt chấm công khác của nhân viên", 409)


def _values(entry: TimeEntry) -> dict:
    return {
        "clock_in_at": entry.clock_in_at,
        "clock_out_at": entry.clock_out_at,
        "hourly_rate": entry.hourly_rate,
    }


def create_entry(
    db: Session,
    actor: User,
    user_id: int,
    clock_in_at: datetime,
    clock_out_at: datetime,
    reason: str,
    ip: str | None,
) -> TimeEntry:
    user = db.get(User, user_id)
    if user is None:
        raise AppError("NOT_FOUND", "Không tìm thấy nhân viên", 404)
    _ensure_valid_range(db, user_id, clock_in_at, clock_out_at, None)
    entry = TimeEntry(
        user_id=user_id,
        clock_in_at=clock_in_at,
        clock_out_at=clock_out_at,
        hourly_rate=user.hourly_rate or Decimal("0"),
        note=reason,
        edited_by=actor.id,
    )
    db.add(entry)
    db.flush()
    audit_service.record(
        db,
        action="ATTENDANCE_CREATE",
        user_id=actor.id,
        entity_type="time_entry",
        entity_id=entry.id,
        new_values={**_values(entry), "user": user.username, "reason": reason},
        ip_address=ip,
    )
    db.commit()
    return entry


def update_entry(
    db: Session,
    actor: User,
    entry_id: int,
    clock_in_at: datetime,
    clock_out_at: datetime | None,
    reason: str,
    ip: str | None,
) -> TimeEntry:
    entry = db.scalar(select(TimeEntry).where(TimeEntry.id == entry_id).with_for_update(of=TimeEntry))
    if entry is None:
        raise AppError("NOT_FOUND", "Không tìm thấy lượt chấm công", 404)
    _ensure_valid_range(db, entry.user_id, clock_in_at, clock_out_at, entry.id)
    before = _values(entry)
    entry.clock_in_at, entry.clock_out_at = clock_in_at, clock_out_at
    entry.note, entry.edited_by = reason, actor.id
    audit_service.record(
        db,
        action="ATTENDANCE_UPDATE",
        user_id=actor.id,
        entity_type="time_entry",
        entity_id=entry.id,
        old_values=before,
        new_values={**_values(entry), "reason": reason},
        ip_address=ip,
    )
    try:
        db.commit()
    except IntegrityError as exc:  # mở lại lượt khi người đó đang có lượt mở khác
        db.rollback()
        raise AppError("TIME_OVERLAP", "Nhân viên đang có một lượt chấm công chưa ra ca", 409) from exc
    return entry


def delete_entry(db: Session, actor: User, entry_id: int, reason: str, ip: str | None) -> None:
    entry = db.get(TimeEntry, entry_id)
    if entry is None:
        raise AppError("NOT_FOUND", "Không tìm thấy lượt chấm công", 404)
    audit_service.record(
        db,
        action="ATTENDANCE_DELETE",
        user_id=actor.id,
        entity_type="time_entry",
        entity_id=entry.id,
        old_values={**_values(entry), "user": entry.user.username},
        new_values={"reason": reason},
        ip_address=ip,
    )
    db.delete(entry)
    db.commit()


# ---------- Đọc ----------


def _in_period(stmt, date_from: date | None, date_to: date | None):
    start, end = vn_day_range(date_from, date_to)
    if start:
        stmt = stmt.where(TimeEntry.clock_in_at >= start)
    if end:
        stmt = stmt.where(TimeEntry.clock_in_at < end)
    return stmt


def list_entries(
    db: Session,
    *,
    user_id: int | None,
    date_from: date | None,
    date_to: date | None,
    page: int,
    page_size: int,
) -> tuple[list[TimeEntry], int]:
    stmt = select(TimeEntry)
    if user_id is not None:
        stmt = stmt.where(TimeEntry.user_id == user_id)
    stmt = _in_period(stmt, date_from, date_to).order_by(TimeEntry.clock_in_at.desc(), TimeEntry.id.desc())
    return paginate(db, stmt, page, page_size)


@dataclass
class UserTotals:
    user: User
    entry_count: int = 0
    minutes: int = 0
    pay: Decimal = Decimal("0")
    open_entries: int = 0
    forgotten: int = 0


def summary(
    db: Session, date_from: date | None, date_to: date | None, user_id: int | None = None
) -> list[UserTotals]:
    """Tổng giờ và tạm tính lương theo người (lượt tính vào ngày VÀO ca). Lượt chưa ra ca không tính tiền."""
    stmt = _in_period(select(TimeEntry), date_from, date_to)
    if user_id is not None:
        stmt = stmt.where(TimeEntry.user_id == user_id)
    totals: dict[int, UserTotals] = {}
    for entry in db.scalars(stmt.order_by(TimeEntry.clock_in_at)).unique():
        row = totals.setdefault(entry.user_id, UserTotals(user=entry.user))
        row.entry_count += 1
        if entry.clock_out_at is None:
            row.open_entries += 1
            row.forgotten += int(is_forgotten(entry))
            continue
        minutes = minutes_of(entry)
        row.minutes += minutes
        row.pay += pay_of(minutes, entry.hourly_rate)
    return sorted(totals.values(), key=lambda r: r.user.full_name)
