from fastapi import APIRouter, Request, Response, status

from app.api.deps import CurrentUser, DbSession, client_ip
from app.core.config import get_settings
from app.core.errors import AppError, error_response
from app.core.rate_limit import SlidingWindowRateLimiter
from app.schemas.auth import ChangePasswordRequest, LoginRequest, MeResponse, ProfileUpdate, TokenResponse
from app.services import auth_service

router = APIRouter(prefix="/auth", tags=["auth"])

REFRESH_COOKIE = "refresh_token"
REFRESH_COOKIE_PATH = "/api/v1/auth"

login_rate_limiter = SlidingWindowRateLimiter(
    limit=get_settings().login_rate_limit_per_minute, window_seconds=60
)


def _set_refresh_cookie(response: Response, raw_token: str) -> None:
    response.set_cookie(
        REFRESH_COOKIE,
        raw_token,
        max_age=get_settings().refresh_token_expire_days * 24 * 3600,
        path=REFRESH_COOKIE_PATH,
        httponly=True,  # JavaScript không đọc được → XSS không lấy được refresh token
        secure=True,  # chỉ gửi qua HTTPS (trình duyệt vẫn chấp nhận với http://localhost)
        samesite="strict",  # không gửi kèm request từ trang web khác → chống CSRF
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(
        REFRESH_COOKIE, path=REFRESH_COOKIE_PATH, httponly=True, secure=True, samesite="strict"
    )


def _ensure_trusted_origin(request: Request) -> None:
    """Lớp chống CSRF thứ hai cho endpoint dùng cookie: nếu trình duyệt gửi Origin thì phải là origin được phép."""
    origin = request.headers.get("origin")
    if origin is not None and origin not in get_settings().cors_origin_list:
        raise AppError("FORBIDDEN", "Nguồn yêu cầu không được phép", 403)


def _token_response(response: Response, session: auth_service.AuthSession) -> TokenResponse:
    _set_refresh_cookie(response, session.refresh_token)
    return TokenResponse(
        access_token=session.access_token,
        expires_in=session.expires_in,
        user=auth_service.to_me(session.user),
    )


@router.post("/login", response_model=TokenResponse, summary="Đăng nhập")
def login(body: LoginRequest, request: Request, response: Response, db: DbSession):
    ip = client_ip(request)
    if not login_rate_limiter.hit(ip or "unknown"):
        raise AppError("RATE_LIMITED", "Bạn thử đăng nhập quá nhiều lần. Vui lòng đợi 1 phút", 429)

    session = auth_service.login(db, body.username, body.password, ip, request.headers.get("user-agent"))
    return _token_response(response, session)


@router.post("/refresh", response_model=TokenResponse, summary="Lấy access token mới từ cookie refresh")
def refresh(request: Request, response: Response, db: DbSession):
    _ensure_trusted_origin(request)
    try:
        session = auth_service.refresh(
            db, request.cookies.get(REFRESH_COOKIE), request.headers.get("user-agent")
        )
    except AppError as exc:
        # Trả response lỗi trực tiếp (thay vì raise) để kèm được lệnh xóa cookie hỏng/hết hạn
        error = error_response(exc.status_code, exc.code, exc.message, exc.details)
        _clear_refresh_cookie(error)
        return error
    return _token_response(response, session)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT, summary="Đăng xuất")
def logout(request: Request, db: DbSession):
    _ensure_trusted_origin(request)
    auth_service.logout(db, request.cookies.get(REFRESH_COOKIE))
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    _clear_refresh_cookie(response)
    return response


@router.get("/me", response_model=MeResponse, summary="Thông tin người dùng hiện tại")
def me(user: CurrentUser):
    return auth_service.to_me(user)


@router.patch("/me", response_model=MeResponse, summary="Cập nhật hồ sơ cá nhân")
def update_me(body: ProfileUpdate, user: CurrentUser, db: DbSession):
    user = auth_service.update_profile(db, user, body.model_dump(exclude_unset=True))
    return auth_service.to_me(user)


@router.post("/change-password", response_model=TokenResponse, summary="Đổi mật khẩu")
def change_password(
    body: ChangePasswordRequest, request: Request, response: Response, user: CurrentUser, db: DbSession
):
    session = auth_service.change_password(
        db, user, body.current_password, body.new_password, request.headers.get("user-agent")
    )
    return _token_response(response, session)
