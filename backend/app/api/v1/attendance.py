from datetime import date
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, Response, status
from sqlalchemy import select

from app.api.deps import DbSession, client_ip, require_permission
from app.core.errors import AppError
from app.core.permissions import Permission, RoleCode
from app.models import TimeEntry, User
from app.schemas.attendance import (
    AttendanceMe,
    PeriodTotals,
    StaffOut,
    SummaryRow,
    TimeEntryCreate,
    TimeEntryOut,
    TimeEntryUpdate,
)
from app.schemas.common import Page, PageParams
from app.services import attendance_service
from app.utils.dates import validate_date_range
from app.utils.time import vn_today

router = APIRouter(prefix="/attendance", tags=["attendance"])

Employee = Annotated[User, Depends(require_permission(Permission.ATTENDANCE_SELF))]
Supervisor = Annotated[User, Depends(require_permission(Permission.ATTENDANCE_MANAGE))]


def to_out(entry: TimeEntry) -> TimeEntryOut:
    minutes = attendance_service.minutes_of(entry)
    return TimeEntryOut(
        id=entry.id,
        user=entry.user,
        clock_in_at=entry.clock_in_at,
        clock_out_at=entry.clock_out_at,
        minutes=minutes,
        hourly_rate=entry.hourly_rate,
        pay=attendance_service.pay_of(minutes, entry.hourly_rate) if entry.clock_out_at else None,
        note=entry.note,
        edited_by=entry.editor,
        forgotten=attendance_service.is_forgotten(entry),
    )


def _ensure_not_own(actor: User, user_id: int) -> None:
    # Quản lý không tự sửa giờ công của mình (chỉ Admin) — tránh tự cộng giờ / lương
    if user_id == actor.id and actor.role.code != RoleCode.ADMIN:
        raise AppError("FORBIDDEN", "Không thể tự thêm / sửa chấm công của chính mình — nhờ Admin", 403)


def _month_start() -> date:
    return vn_today().replace(day=1)


@router.post("/clock-in", response_model=TimeEntryOut, status_code=status.HTTP_201_CREATED, summary="Vào ca")
def clock_in(user: Employee, db: DbSession):
    return to_out(attendance_service.clock_in(db, user))


@router.post("/clock-out", response_model=TimeEntryOut, summary="Ra ca")
def clock_out(user: Employee, db: DbSession):
    return to_out(attendance_service.clock_out(db, user))


@router.get("/me", response_model=AttendanceMe, summary="Chấm công của tôi: lượt đang mở, tổng tháng này")
def my_attendance(user: Employee, db: DbSession):
    current = attendance_service.open_entry(db, user.id)
    month = attendance_service.summary(db, _month_start(), vn_today(), user_id=user.id)
    totals = month[0] if month else None
    recent, _ = attendance_service.list_entries(
        db, user_id=user.id, date_from=None, date_to=None, page=1, page_size=10
    )
    return AttendanceMe(
        current=to_out(current) if current else None,
        month=PeriodTotals(
            entry_count=totals.entry_count if totals else 0,
            minutes=totals.minutes if totals else 0,
            pay=totals.pay if totals else Decimal("0"),
        ),
        recent=[to_out(e) for e in recent],
    )


@router.get(
    "/staff", response_model=list[StaffOut], summary="Nhân viên đang làm việc (để chọn khi thêm lượt)"
)
def staff(_: Supervisor, db: DbSession):
    # Quản lý không có quyền xem trang Người dùng → chỉ trả tên + vai trò, không có email/SĐT/lương
    users = db.scalars(select(User).where(User.is_active.is_(True)).order_by(User.full_name))
    return [StaffOut(id=u.id, full_name=u.full_name, role=u.role.name) for u in users]


@router.get(
    "/summary", response_model=list[SummaryRow], summary="Bảng công: tổng giờ và tạm tính lương theo người"
)
def summary(
    _: Supervisor,
    db: DbSession,
    date_from: Annotated[date | None, Query(description="Mặc định: đầu tháng này")] = None,
    date_to: Annotated[date | None, Query(description="Mặc định: hôm nay")] = None,
):
    date_from, date_to = date_from or _month_start(), date_to or vn_today()
    validate_date_range(date_from, date_to)
    return [
        SummaryRow(
            user=row.user,
            hourly_rate=row.user.hourly_rate,
            entry_count=row.entry_count,
            minutes=row.minutes,
            pay=row.pay,
            open_entries=row.open_entries,
            forgotten=row.forgotten,
        )
        for row in attendance_service.summary(db, date_from, date_to)
    ]


@router.get("", response_model=Page[TimeEntryOut], summary="Các lượt chấm công (lọc theo nhân viên, ngày)")
def list_entries(
    _: Supervisor,
    db: DbSession,
    params: Annotated[PageParams, Depends()],
    user_id: int | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
):
    validate_date_range(date_from, date_to)
    items, total = attendance_service.list_entries(
        db,
        user_id=user_id,
        date_from=date_from,
        date_to=date_to,
        page=params.page,
        page_size=params.page_size,
    )
    return Page[TimeEntryOut](
        items=[to_out(e) for e in items], page=params.page, page_size=params.page_size, total=total
    )


@router.post(
    "", response_model=TimeEntryOut, status_code=status.HTTP_201_CREATED, summary="Thêm lượt (quên chấm)"
)
def create_entry(body: TimeEntryCreate, request: Request, actor: Supervisor, db: DbSession):
    _ensure_not_own(actor, body.user_id)
    entry = attendance_service.create_entry(
        db, actor, body.user_id, body.clock_in_at, body.clock_out_at, body.reason, client_ip(request)
    )
    return to_out(entry)


@router.patch("/{entry_id}", response_model=TimeEntryOut, summary="Sửa giờ vào / ra (bắt buộc lý do)")
def update_entry(entry_id: int, body: TimeEntryUpdate, request: Request, actor: Supervisor, db: DbSession):
    entry = db.get(TimeEntry, entry_id)
    if entry is None:
        raise AppError("NOT_FOUND", "Không tìm thấy lượt chấm công", 404)
    _ensure_not_own(actor, entry.user_id)
    updated = attendance_service.update_entry(
        db, actor, entry_id, body.clock_in_at, body.clock_out_at, body.reason, client_ip(request)
    )
    return to_out(updated)


@router.delete(
    "/{entry_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Xóa lượt chấm nhầm (bắt buộc lý do)"
)
def delete_entry(
    entry_id: int,
    request: Request,
    actor: Supervisor,
    db: DbSession,
    reason: Annotated[str, Query(min_length=3, max_length=255)],
):
    entry = db.get(TimeEntry, entry_id)
    if entry is None:
        raise AppError("NOT_FOUND", "Không tìm thấy lượt chấm công", 404)
    _ensure_not_own(actor, entry.user_id)
    attendance_service.delete_entry(db, actor, entry_id, reason.strip(), client_ip(request))
    return Response(status_code=status.HTTP_204_NO_CONTENT)
