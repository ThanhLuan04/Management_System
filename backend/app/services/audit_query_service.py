from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AuditLog, User
from app.schemas.report import AuditLogOut
from app.utils.pagination import paginate
from app.utils.time import vn_day_range


def list_audit_logs(
    db: Session,
    *,
    user_id: int | None,
    action: str | None,
    entity_type: str | None,
    entity_id: int | None,
    date_from: date | None,
    date_to: date | None,
    page: int,
    page_size: int,
) -> tuple[list[AuditLogOut], int]:
    stmt = select(AuditLog)
    if user_id is not None:
        stmt = stmt.where(AuditLog.user_id == user_id)
    if action:
        stmt = stmt.where(AuditLog.action == action.upper())
    if entity_type:
        stmt = stmt.where(AuditLog.entity_type == entity_type)
    if entity_id is not None:
        stmt = stmt.where(AuditLog.entity_id == entity_id)
    start, end = vn_day_range(date_from, date_to)
    if start:
        stmt = stmt.where(AuditLog.created_at >= start)
    if end:
        stmt = stmt.where(AuditLog.created_at < end)
    stmt = stmt.order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
    logs, total = paginate(db, stmt, page, page_size)

    user_ids = {log.user_id for log in logs if log.user_id is not None}
    users = (
        {u.id: u for u in db.scalars(select(User).where(User.id.in_(user_ids))).unique()} if user_ids else {}
    )
    items = [
        AuditLogOut(
            id=log.id,
            user={"id": users[log.user_id].id, "full_name": users[log.user_id].full_name}
            if log.user_id in users
            else None,
            action=log.action,
            entity_type=log.entity_type,
            entity_id=log.entity_id,
            old_values=log.old_values,
            new_values=log.new_values,
            ip_address=log.ip_address,
            created_at=log.created_at,
        )
        for log in logs
    ]
    return items, total
