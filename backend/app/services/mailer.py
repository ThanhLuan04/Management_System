"""
Gửi email qua SMTP (Gmail: smtp.gmail.com:587 + STARTTLS + mật khẩu ứng dụng).

Chưa cấu hình SMTP_HOST:
- development/test: ghi nội dung (kể cả mã) ra log để thử luồng quên mật khẩu trên máy — CHỈ ở môi trường dev;
- production: ghi lỗi "chưa cấu hình", KHÔNG ghi mã (không bao giờ để mã/mật khẩu nằm trong log production).
Hàm chạy sau khi đã trả response (BackgroundTasks) nên lỗi gửi chỉ được ghi log, không lộ ra cho người yêu cầu.
"""

import logging
import smtplib
import ssl
from email.message import EmailMessage

from app.core.config import get_settings

logger = logging.getLogger(__name__)


def send_email(to: str, subject: str, body: str) -> bool:
    settings = get_settings()
    if not settings.smtp_host:
        if settings.is_production:
            logger.error("Chưa cấu hình SMTP_HOST — không gửi được email '%s'", subject)
        else:
            logger.warning("[DEV - chưa cấu hình SMTP] Email tới %s | %s\n%s", to, subject, body)
        return False

    message = EmailMessage()
    message["From"] = settings.smtp_from or settings.smtp_username
    message["To"] = to
    message["Subject"] = subject
    message.set_content(body)
    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as smtp:
            smtp.starttls(context=ssl.create_default_context())
            if settings.smtp_username:
                smtp.login(settings.smtp_username, settings.smtp_password or "")
            smtp.send_message(message)
    except (OSError, smtplib.SMTPException):
        # Không ghi nội dung (có mã) vào log; chỉ ghi lỗi để quản trị viên kiểm tra cấu hình SMTP
        logger.exception("Gửi email '%s' thất bại", subject)
        return False
    return True


def send_password_reset_code(to: str, full_name: str, store_name: str, code: str, minutes: int) -> bool:
    body = (
        f"Xin chào {full_name},\n\n"
        f"Mã xác nhận để đặt lại mật khẩu {store_name} của bạn là:\n\n"
        f"    {code}\n\n"
        f"Mã có hiệu lực trong {minutes} phút và chỉ dùng được một lần.\n"
        "Nếu bạn không yêu cầu đặt lại mật khẩu, hãy bỏ qua email này — mật khẩu hiện tại vẫn giữ nguyên.\n"
    )
    # Không đặt mã trong tiêu đề: tiêu đề hiện trên thông báo màn hình khóa điện thoại
    return send_email(to, f"[{store_name}] Mã đặt lại mật khẩu", body)
