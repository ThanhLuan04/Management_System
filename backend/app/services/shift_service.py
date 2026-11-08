"""
Ca làm việc của két tiền chung.

- Mỗi lúc chỉ một ca đang mở (unique index một phần trong DB); mọi giao dịch tiền (bán, trả hàng, hủy đơn)
  bắt buộc có ca đang mở và được gắn vào ca đó.
- Đồng thời: giao dịch tiền khóa CHIA SẺ dòng ca (FOR SHARE) — nhiều thu ngân bán song song được;
  đóng ca khóa ĐỘC QUYỀN (FOR UPDATE) nên phải chờ mọi giao dịch đang dở commit xong rồi mới cộng số liệu.
  Sau khi đóng, giao dịch mới không còn thấy ca mở → báo NO_OPEN_SHIFT. Không giao dịch nào lọt ra ngoài ca.
- Tiền mặt phải có = tiền đầu ca + thu tiền mặt − hoàn tiền mặt (tiền thừa đã trả lại khách không tính).
"""

from collections import defaultdict
from datetime import date
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.models import CashShift, OrderStatus, Payment, SalesOrder, ShiftStatus, User
from app.schemas.shift import CashierSales, MethodAmount, ShiftOut, ShiftSummaryOut
from app.services import audit_service, code_gen
from app.services.pricing import round_money
from app.utils.pagination import paginate
from app.utils.time import utcnow, vn_day_range, vn_today

ZERO = Decimal("0")


def _no_open_shift() -> AppError:
    return AppError(
        "NO_OPEN_SHIFT", "Chưa mở ca — hãy mở ca ở màn hình Bán hàng trước khi thu/hoàn tiền", 409
    )


def open_shift_for_money(db: Session) -> CashShift:
    """Ca đang mở, khóa chia sẻ đến hết transaction. Dùng trong bán hàng / trả hàng / hủy đơn."""
    shift = db.scalar(
        select(CashShift).where(CashShift.status == ShiftStatus.OPEN).with_for_update(read=True, of=CashShift)
    )
    if shift is None:
        raise _no_open_shift()
    return shift


def current_shift(db: Session) -> CashShift | None:
    return db.scalar(select(CashShift).where(CashShift.status == ShiftStatus.OPEN))


def suggested_opening_cash(db: Session) -> Decimal:
    """Gợi ý tiền đầu ca = tiền đếm được lúc đóng ca gần nhất (két chung, giao ca giữ nguyên tiền trong két)."""
    last = db.scalar(
        select(CashShift.counted_cash)
        .where(CashShift.status == ShiftStatus.CLOSED)
        .order_by(CashShift.closed_at.desc())
    )
    return last if last is not None else ZERO


def open_shift(db: Session, opening_cash: Decimal, actor: User, ip: str | None) -> CashShift:
    if current_shift(db) is not None:
        raise AppError("SHIFT_ALREADY_OPEN", "Đang có ca mở — đóng ca hiện tại trước khi mở ca mới", 409)
    shift = CashShift(
        code=code_gen.document_code(db, "CA", vn_today()),
        status=ShiftStatus.OPEN,
        opening_cash=opening_cash,
        opened_by=actor.id,
    )
    db.add(shift)
    try:
        db.flush()
    except IntegrityError as exc:  # hai người bấm mở ca cùng lúc: unique index chặn người sau
        db.rollback()
        raise AppError(
            "SHIFT_ALREADY_OPEN", "Đang có ca mở — đóng ca hiện tại trước khi mở ca mới", 409
        ) from exc
    audit_service.record(
        db,
        action="SHIFT_OPEN",
        user_id=actor.id,
        entity_type="cash_shift",
        entity_id=shift.id,
        new_values={"code": shift.code, "opening_cash": opening_cash},
        ip_address=ip,
    )
    db.commit()
    return shift


def _money_by_method(db: Session, shift_id: int) -> dict[str, dict[str, Decimal]]:
    totals: dict[str, dict[str, Decimal]] = {
        "PAYMENT": defaultdict(lambda: ZERO),
        "REFUND": defaultdict(lambda: ZERO),
    }
    rows = db.execute(
        select(Payment.type, Payment.method, func.sum(Payment.amount))
        .where(Payment.shift_id == shift_id)
        .group_by(Payment.type, Payment.method)
    )
    for payment_type, method, amount in rows:
        totals[payment_type][method] = amount
    return totals


def _expected_cash(shift: CashShift, money: dict[str, dict[str, Decimal]]) -> Decimal:
    return round_money(shift.opening_cash + money["PAYMENT"]["CASH"] - money["REFUND"]["CASH"])


def close_shift(
    db: Session, shift_id: int, counted_cash: Decimal, note: str | None, actor: User, ip: str | None
) -> CashShift:
    # Khóa độc quyền: chờ các giao dịch đang giữ khóa chia sẻ commit xong → số liệu cộng bên dưới là đầy đủ
    shift = db.scalar(select(CashShift).where(CashShift.id == shift_id).with_for_update(of=CashShift))
    if shift is None:
        raise AppError("NOT_FOUND", "Không tìm thấy ca", 404)
    if shift.status != ShiftStatus.OPEN:
        db.rollback()
        raise AppError("SHIFT_ALREADY_CLOSED", "Ca này đã đóng", 409)

    expected = _expected_cash(shift, _money_by_method(db, shift.id))
    difference = round_money(counted_cash - expected)
    if difference != 0 and not note:
        db.rollback()
        raise AppError(
            "CLOSE_NOTE_REQUIRED",
            "Tiền đếm được lệch so với tiền mặt phải có — hãy ghi lý do chênh lệch",
            422,
            {
                "expected_cash": str(expected),
                "counted_cash": str(round_money(counted_cash)),
                "difference": str(difference),
            },
        )

    shift.status = ShiftStatus.CLOSED
    shift.counted_cash = counted_cash
    shift.expected_cash = expected
    shift.difference = difference
    shift.close_note = note
    shift.closed_by = actor.id
    shift.closed_at = utcnow()
    audit_service.record(
        db,
        action="SHIFT_CLOSE",
        user_id=actor.id,
        entity_type="cash_shift",
        entity_id=shift.id,
        new_values={
            "code": shift.code,
            "expected_cash": expected,
            "counted_cash": counted_cash,
            "difference": difference,
        },
        ip_address=ip,
    )
    db.commit()
    return shift


# ---------- Đọc ----------


def _summary(shift: CashShift) -> dict:
    return {
        "id": shift.id,
        "code": shift.code,
        "status": shift.status,
        "opening_cash": shift.opening_cash,
        "opened_by": shift.opener,
        "opened_at": shift.opened_at,
        "counted_cash": shift.counted_cash,
        "expected_cash": shift.expected_cash,
        "difference": shift.difference,
        "close_note": shift.close_note,
        "closed_by": shift.closer,
        "closed_at": shift.closed_at,
    }


def to_out(db: Session, shift: CashShift) -> ShiftOut:
    money = _money_by_method(db, shift.id)
    cashiers = db.execute(
        select(
            User.id,
            User.full_name,
            func.count(SalesOrder.id),
            func.coalesce(func.sum(SalesOrder.total_amount), 0),
        )
        .join(User, User.id == SalesOrder.created_by)
        .where(SalesOrder.shift_id == shift.id, SalesOrder.status == OrderStatus.COMPLETED)
        .group_by(User.id, User.full_name)
        .order_by(func.sum(SalesOrder.total_amount).desc())
    ).all()

    def as_list(payment_type: str) -> list[MethodAmount]:
        return [MethodAmount(method=m, amount=a) for m, a in sorted(money[payment_type].items())]

    return ShiftOut(
        **_summary(shift),
        # Ca đang mở: tính trực tiếp; ca đã đóng: dùng số đã chốt lúc đóng
        current_expected_cash=shift.expected_cash
        if shift.expected_cash is not None
        else _expected_cash(shift, money),
        cash_received=round_money(money["PAYMENT"]["CASH"]),
        cash_refunded=round_money(money["REFUND"]["CASH"]),
        received_by_method=as_list("PAYMENT"),
        refunded_by_method=as_list("REFUND"),
        order_count=sum(row[2] for row in cashiers),
        by_cashier=[
            CashierSales(user={"id": uid, "full_name": name}, order_count=count, revenue=round_money(revenue))
            for uid, name, count, revenue in cashiers
        ],
    )


def get_shift(db: Session, shift_id: int) -> CashShift:
    shift = db.get(CashShift, shift_id)
    if shift is None:
        raise AppError("NOT_FOUND", "Không tìm thấy ca", 404)
    return shift


def to_summary(shift: CashShift) -> ShiftSummaryOut:
    return ShiftSummaryOut(**_summary(shift))


def list_shifts(
    db: Session,
    *,
    date_from: date | None,
    date_to: date | None,
    discrepancy_only: bool,
    page: int,
    page_size: int,
) -> tuple[list[CashShift], int]:
    stmt = select(CashShift)
    start, end = vn_day_range(date_from, date_to)
    if start:
        stmt = stmt.where(CashShift.opened_at >= start)
    if end:
        stmt = stmt.where(CashShift.opened_at < end)
    if discrepancy_only:
        stmt = stmt.where(CashShift.difference != 0)
    return paginate(db, stmt.order_by(CashShift.opened_at.desc(), CashShift.id.desc()), page, page_size)
