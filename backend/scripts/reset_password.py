"""
Đặt lại mật khẩu và mở khóa một tài khoản từ dòng lệnh — dùng khi quên mật khẩu Admin (không còn ai đăng nhập
vào trang Người dùng để đặt lại). Ai chạy được lệnh này trên máy chủ thì vốn đã có toàn quyền với database,
nên không mở thêm lỗ hổng nào. Thao tác được ghi vào nhật ký (USER_RESET_PASSWORD, người thực hiện trống).

Chạy tại thư mục backend:
    .\\.venv\\Scripts\\python.exe -m scripts.reset_password --username admin

Mật khẩu mới được hỏi qua getpass (không hiện lên màn hình, không nằm trong lịch sử lệnh).
Mọi phiên đăng nhập cũ của tài khoản bị thu hồi.
"""

import argparse
import getpass
import sys

from pydantic import ValidationError
from sqlalchemy import func, select

from app.db.session import SessionLocal
from app.models import User
from app.schemas.user import PasswordReset
from app.services import user_service


def main() -> int:
    parser = argparse.ArgumentParser(description="Đặt lại mật khẩu và mở khóa tài khoản SmartStore")
    parser.add_argument("--username", required=True)
    args = parser.parse_args()

    with SessionLocal() as db:
        user = db.scalar(select(User).where(func.lower(User.username) == args.username.strip().lower()))
        if user is None:
            print(f"Không có tài khoản '{args.username}'.", file=sys.stderr)
            return 1

        password = getpass.getpass("Mật khẩu mới (≥ 8 ký tự, có chữ và số): ")
        if password != getpass.getpass("Nhập lại mật khẩu mới: "):
            print("Mật khẩu nhập lại không khớp.", file=sys.stderr)
            return 1
        try:
            data = PasswordReset(new_password=password)
        except ValidationError as exc:
            for err in exc.errors():
                print(f"- {err['msg']}", file=sys.stderr)
            return 1

        user_service.reset_password(db, None, user.id, data.new_password)
        # Đọc lại trong session (sau commit object hết hạn, đóng session rồi thì không đọc được nữa)
        print(
            f"Đã đặt mật khẩu mới và mở khóa tài khoản '{user.username}'. Các phiên đăng nhập cũ đã bị thu hồi."
        )
        if not user.is_active:
            print(
                "Lưu ý: tài khoản đang ở trạng thái Ngừng hoạt động — mật khẩu đã đổi nhưng vẫn chưa đăng nhập được."
            )
    return 0


if __name__ == "__main__":
    sys.exit(main())
