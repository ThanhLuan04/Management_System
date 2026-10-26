from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.core.security import hash_password
from app.models import Role, User
from app.schemas.user import UserCreate
from app.services import audit_service
from app.services.auth_service import ensure_email_available, revoke_all_sessions
from app.utils.pagination import apply_sort, paginate

SORTABLE_FIELDS = {
    "username": User.username,
    "full_name": User.full_name,
    "created_at": User.created_at,
    "last_login_at": User.last_login_at,
}

# Các trường được phép ghi vào audit khi sửa user
_AUDITED_FIELDS = ("full_name", "email", "phone", "role_id", "is_active")


def list_roles(db: Session) -> list[Role]:
    return list(db.scalars(select(Role).order_by(Role.id)))


def list_users(
    db: Session,
    *,
    q: str | None,
    role: str | None,
    is_active: bool | None,
    page: int,
    page_size: int,
    sort: str | None,
) -> tuple[list[User], int]:
    stmt = select(User).join(User.role)
    if q:
        q = q.strip()
        stmt = stmt.where(
            or_(
                User.username.icontains(q, autoescape=True),
                User.full_name.icontains(q, autoescape=True),
                User.email.icontains(q, autoescape=True),
            )
        )
    if role:
        stmt = stmt.where(Role.code == role.upper())
    if is_active is not None:
        stmt = stmt.where(User.is_active == is_active)
    stmt = apply_sort(stmt, sort, SORTABLE_FIELDS, default="-created_at")
    return paginate(db, stmt, page, page_size)


def get_user(db: Session, user_id: int) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise AppError("NOT_FOUND", "Không tìm thấy người dùng", 404)
    return user


def _get_role(db: Session, role_id: int) -> Role:
    role = db.get(Role, role_id)
    if role is None:
        raise AppError(
            "VALIDATION_ERROR",
            "Dữ liệu không hợp lệ",
            422,
            [{"field": "role_id", "message": "Vai trò không tồn tại"}],
        )
    return role


def _ensure_username_available(db: Session, username: str) -> None:
    if db.scalar(select(User.id).where(func.lower(User.username) == username.lower())) is not None:
        raise AppError("DUPLICATE_USERNAME", "Tên đăng nhập đã tồn tại", 409)


def _commit_or_conflict(db: Session) -> None:
    """Commit; nếu hai request cùng tạo trùng username/email cùng lúc thì unique index trong DB chặn lại."""
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        constraint = getattr(getattr(exc.orig, "diag", None), "constraint_name", "") or ""
        if "username" in constraint:
            raise AppError("DUPLICATE_USERNAME", "Tên đăng nhập đã tồn tại", 409) from exc
        if "email" in constraint:
            raise AppError("DUPLICATE_EMAIL", "Email đã được sử dụng", 409) from exc
        raise


def create_user(db: Session, data: UserCreate, actor_id: int | None, ip: str | None = None) -> User:
    _ensure_username_available(db, data.username)
    ensure_email_available(db, data.email)
    role = _get_role(db, data.role_id)

    user = User(
        username=data.username,
        password_hash=hash_password(data.password),
        full_name=data.full_name,
        email=data.email,
        phone=data.phone,
        role=role,
    )
    db.add(user)
    db.flush()  # lấy user.id cho audit log
    audit_service.record(
        db,
        action="USER_CREATE",
        user_id=actor_id,
        entity_type="user",
        entity_id=user.id,
        new_values={"username": user.username, "full_name": user.full_name, "role": role.code},
        ip_address=ip,
    )
    _commit_or_conflict(db)
    return user


def _ensure_not_self(actor: User, target: User, message: str) -> None:
    # Admin không tự khóa / tự hạ quyền mình. Vì chỉ Admin quản lý được user, quy tắc này cũng đảm bảo
    # hệ thống luôn còn ít nhất một Admin đang hoạt động (người thao tác chính là Admin đang hoạt động).
    if actor.id == target.id:
        raise AppError("CANNOT_MODIFY_SELF", message, 409)


def _snapshot(user: User) -> dict:
    return {field: getattr(user, field) for field in _AUDITED_FIELDS}


def update_user(db: Session, actor: User, user_id: int, changes: dict, ip: str | None = None) -> User:
    user = get_user(db, user_id)
    before = _snapshot(user)

    # full_name / role_id không được để trống; gửi null thì coi như không đổi
    for required in ("full_name", "role_id"):
        if changes.get(required, ...) is None:
            changes.pop(required)

    if "role_id" in changes and changes["role_id"] != user.role_id:
        _ensure_not_self(actor, user, "Không thể tự thay đổi vai trò của chính mình")
        user.role = _get_role(db, changes.pop("role_id"))
    else:
        changes.pop("role_id", None)

    if "email" in changes:
        ensure_email_available(db, changes["email"], exclude_user_id=user.id)
    for key, value in changes.items():
        setattr(user, key, value)

    after = _snapshot(user)
    diff_keys = [k for k in _AUDITED_FIELDS if before[k] != after[k]]
    if diff_keys:
        audit_service.record(
            db,
            action="USER_UPDATE",
            user_id=actor.id,
            entity_type="user",
            entity_id=user.id,
            old_values={k: before[k] for k in diff_keys},
            new_values={k: after[k] for k in diff_keys},
            ip_address=ip,
        )
    _commit_or_conflict(db)
    return user


def set_status(db: Session, actor: User, user_id: int, is_active: bool, ip: str | None = None) -> User:
    user = get_user(db, user_id)
    if user.is_active == is_active:
        return user
    if not is_active:
        _ensure_not_self(actor, user, "Không thể tự khóa tài khoản của chính mình")
        revoke_all_sessions(db, user.id)

    user.is_active = is_active
    audit_service.record(
        db,
        action="USER_ACTIVATE" if is_active else "USER_DEACTIVATE",
        user_id=actor.id,
        entity_type="user",
        entity_id=user.id,
        ip_address=ip,
    )
    db.commit()
    return user


def reset_password(db: Session, actor: User, user_id: int, new_password: str, ip: str | None = None) -> None:
    user = get_user(db, user_id)
    user.password_hash = hash_password(new_password)
    user.failed_login_count = 0
    user.locked_until = None
    revoke_all_sessions(db, user.id)
    audit_service.record(
        db,
        action="USER_RESET_PASSWORD",
        user_id=actor.id,
        entity_type="user",
        entity_id=user.id,
        ip_address=ip,
    )
    db.commit()
