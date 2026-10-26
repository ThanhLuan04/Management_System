"""
Tạo tài khoản Admin (dùng khi khởi tạo hệ thống, lúc chưa có ai để đăng nhập vào trang quản lý người dùng).

Chạy tại thư mục backend:
    .\\.venv\\Scripts\\python.exe -m scripts.create_admin --username admin --full-name "Quản trị viên"

Mật khẩu được hỏi qua getpass (không hiện lên màn hình, không nằm trong lịch sử lệnh).
"""

import argparse
import getpass
import sys

from pydantic import ValidationError

from app.core.errors import AppError
from app.core.permissions import RoleCode
from app.db.session import SessionLocal
from app.models import Role
from app.schemas.user import UserCreate
from app.services import user_service


def main() -> int:
    parser = argparse.ArgumentParser(description="Tạo tài khoản Admin cho SmartStore")
    parser.add_argument("--username", required=True)
    parser.add_argument("--full-name", required=True)
    parser.add_argument("--email", default=None)
    args = parser.parse_args()

    password = getpass.getpass("Mật khẩu (≥ 8 ký tự, có chữ và số): ")
    if password != getpass.getpass("Nhập lại mật khẩu: "):
        print("Mật khẩu nhập lại không khớp.", file=sys.stderr)
        return 1

    with SessionLocal() as db:
        admin_role = db.query(Role).filter_by(code=RoleCode.ADMIN).one()
        try:
            data = UserCreate(
                username=args.username,
                password=password,
                full_name=args.full_name,
                email=args.email,
                role_id=admin_role.id,
            )
            user = user_service.create_user(db, data, actor_id=None)
        except ValidationError as exc:
            for err in exc.errors():
                print(f"- {'.'.join(map(str, err['loc']))}: {err['msg']}", file=sys.stderr)
            return 1
        except AppError as exc:
            print(exc.message, file=sys.stderr)
            return 1

    print(f"Đã tạo Admin '{user.username}' (id={user.id}).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
