# 04 – Cấu trúc thư mục

```
smartstore/  (D:\management_system)
├── backend/
│   ├── app/
│   │   ├── main.py              # Tạo FastAPI app, middleware, đăng ký router, exception handler
│   │   ├── api/
│   │   │   ├── deps.py          # Dependency dùng chung: get_db, get_current_user, require_permission
│   │   │   └── v1/
│   │   │       ├── router.py    # Gộp router các module
│   │   │       ├── auth.py  users.py  categories.py  brands.py  products.py
│   │   │       ├── suppliers.py  customers.py  purchases.py  inventory.py
│   │   │       ├── orders.py  returns.py  reports.py  settings.py  audit_logs.py
│   │   ├── core/
│   │   │   ├── config.py        # Đọc biến môi trường (pydantic-settings)
│   │   │   ├── security.py      # Hash Argon2, tạo/kiểm tra JWT, refresh token
│   │   │   ├── permissions.py   # Mã quyền và quyền của từng vai trò
│   │   │   ├── errors.py        # AppError, các mã lỗi, handler trả định dạng lỗi chuẩn
│   │   │   └── logging.py       # Cấu hình log có request_id, lọc dữ liệu nhạy cảm
│   │   ├── db/
│   │   │   ├── base.py          # DeclarativeBase, mixin timestamp
│   │   │   └── session.py       # Engine, SessionLocal
│   │   ├── models/              # SQLAlchemy model, mỗi nhóm bảng một file
│   │   ├── schemas/             # Pydantic schema request/response, mỗi module một file
│   │   ├── services/            # Nghiệp vụ + truy vấn: product_service.py, sales_service.py, ...
│   │   │   ├── inventory_ops.py # Hàm lõi: khóa tồn, tăng/giảm tồn, tính WAC, ghi lịch sử
│   │   │   ├── pricing.py       # Hàm thuần: tính tổng, phân bổ giảm giá, tiền hoàn (dễ unit test)
│   │   │   └── code_gen.py      # Sinh mã chứng từ
│   │   └── utils/               # Tiện ích nhỏ: thời gian VN, xuất CSV, phân trang
│   ├── alembic/                 # Migration
│   ├── alembic.ini
│   ├── scripts/
│   │   └── seed.py              # Tạo dữ liệu mẫu (tài khoản demo, sản phẩm, giao dịch)
│   ├── tests/
│   │   ├── conftest.py          # DB test riêng (smartstore_test), fixture client, user theo vai trò
│   │   ├── unit/                # pricing, WAC, permissions — không cần DB
│   │   └── integration/         # Gọi API thật với DB test, bao gồm test đồng thời
│   ├── uploads/                 # Ảnh sản phẩm (bị .gitignore)
│   ├── pyproject.toml           # Dependency + cấu hình pytest, ruff
│   ├── Dockerfile
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── main.tsx  App.tsx
│   │   ├── app/                 # router.tsx, providers (QueryClient, Auth), route guard theo quyền
│   │   ├── components/
│   │   │   ├── ui/              # Component shadcn/ui (Button, Input, Dialog, Table, Badge, ...)
│   │   │   └── common/          # DataTable, PageHeader, ConfirmDialog, EmptyState, ErrorState, MoneyText, StatusBadge
│   │   ├── layouts/             # AppLayout (sidebar + header + breadcrumb), AuthLayout
│   │   ├── features/            # Mỗi module một thư mục: api.ts, hooks.ts, schemas.ts, components/, pages/
│   │   │   ├── auth/  dashboard/  products/  categories/  suppliers/  customers/
│   │   │   ├── purchases/  pos/  orders/  returns/  inventory/  reports/  users/  settings/
│   │   ├── services/            # http.ts: Axios instance, gắn token, tự refresh khi 401
│   │   ├── hooks/               # Hook dùng chung: useDebounce, usePagination, usePermission
│   │   ├── types/               # Kiểu dùng chung: Paginated<T>, ApiError
│   │   ├── utils/               # format.ts (tiền VND, ngày giờ VN), money.ts
│   │   └── test/                # setup Vitest, MSW handler
│   ├── e2e/                     # Playwright
│   ├── index.html  vite.config.ts  tailwind.config.ts  tsconfig.json  package.json
│   ├── Dockerfile
│   └── .env.example
├── docs/                        # Tài liệu thiết kế (thư mục này)
├── scripts/                     # backup_db.ps1, restore_db.ps1, ...
├── docker-compose.yml
├── .gitignore
├── .env.example
└── README.md
```

## Các quyết định cấu trúc

- **Không tách lớp `repositories/`.** Ở quy mô này, mỗi repository chỉ bọc lại vài câu truy vấn SQLAlchemy, thêm boilerplate mà không đem lại lợi ích rõ ràng. Service gọi trực tiếp SQLAlchemy. Phần dùng chung thực sự (thao tác tồn kho) được gom vào `inventory_ops.py`. Khi dự án lớn hơn có thể tách sau.
- **Hàm tính toán thuần nằm trong `pricing.py`.** Các hàm này không phụ thuộc DB, nên unit test được nhanh và đầy đủ các trường hợp biên của làm tròn và phân bổ.
- **Router mỏng.** Router chỉ nhận request, gọi service và trả schema. Toàn bộ quy tắc nghiệp vụ nằm trong service.
- **Transaction do service quản lý.** Mỗi nghiệp vụ gọi `db.commit()` đúng một lần ở cuối. Nếu có lỗi giữa chừng, `get_db` sẽ rollback, nên không có thay đổi dở dang nào được lưu. Audit log được ghi trong cùng transaction với nghiệp vụ.
- **Frontend tổ chức theo `features/`** chứ không gom mọi trang vào `pages/`. Mỗi module tự chứa API, hook, form và trang của mình, nên khi sửa một chức năng chỉ cần mở một thư mục.
