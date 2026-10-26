from collections.abc import Callable, Iterator
from typing import Annotated

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.core.permissions import Permission, permissions_for
from app.core.security import decode_access_token
from app.db.session import SessionLocal
from app.models import User


def get_db() -> Iterator[Session]:
    """Mỗi request dùng một session riêng. Lỗi giữa chừng → rollback; luôn đóng session khi xong."""
    db = SessionLocal()
    try:
        yield db
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


DbSession = Annotated[Session, Depends(get_db)]

# auto_error=False để tự trả lỗi theo định dạng chung thay vì lỗi mặc định của FastAPI
_bearer = HTTPBearer(auto_error=False)


def get_current_user(
    db: DbSession,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> User:
    if credentials is None:
        raise AppError("UNAUTHORIZED", "Vui lòng đăng nhập", 401, headers={"WWW-Authenticate": "Bearer"})

    user_id = decode_access_token(credentials.credentials)
    # Đọc user từ DB mỗi request: khóa tài khoản hay đổi vai trò có hiệu lực ngay, không chờ token hết hạn
    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise AppError(
            "UNAUTHORIZED", "Phiên đăng nhập không còn hiệu lực", 401, headers={"WWW-Authenticate": "Bearer"}
        )
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_permission(*required: Permission) -> Callable[[User], User]:
    """Dependency kiểm tra quyền ở backend. Dùng: user: Annotated[User, Depends(require_permission(...))]."""

    def checker(user: CurrentUser) -> User:
        granted = permissions_for(user.role.code)
        if not all(permission in granted for permission in required):
            raise AppError("FORBIDDEN", "Bạn không có quyền thực hiện thao tác này", 403)
        return user

    return checker


def client_ip(request: Request) -> str | None:
    # Khi deploy sau reverse proxy cần cấu hình uvicorn --proxy-headers để request.client là IP thật
    return request.client.host if request.client else None
