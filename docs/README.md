# Tài liệu thiết kế SmartStore

| File | Nội dung |
|---|---|
| [01-business-spec.md](01-business-spec.md) | Bài toán, vai trò, phân quyền, use case, luồng nghiệp vụ, quy tắc, mã lỗi, phạm vi MVP |
| [02-database-design.md](02-database-design.md) | ERD, chi tiết bảng/ràng buộc/index, dữ liệu thay đổi theo nghiệp vụ, xử lý đồng thời |
| [03-api-design.md](03-api-design.md) | Quy ước REST, xác thực, phân trang, danh sách endpoint, đặc tả API chính |
| [04-project-structure.md](04-project-structure.md) | Cấu trúc thư mục và trách nhiệm từng phần |
| [05-ui-design-system.md](05-ui-design-system.md) | Design system, trạng thái hiển thị, wireframe |
| [06-security-review.md](06-security-review.md) | Rà soát bảo mật theo yêu cầu, bằng chứng kiểm tra, việc còn lại khi deploy |
| [screenshots/](screenshots/) | Ảnh màn hình (tạo tự động bằng `npm run screenshots`) |

## Công nghệ

| Lớp | Công nghệ |
|---|---|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS v4, component tự viết trên Radix UI, TanStack Query, React Hook Form, Zod, Recharts |
| Backend | Python 3.12, FastAPI, Pydantic v2, SQLAlchemy 2.1, Alembic, Argon2, PyJWT |
| Database | PostgreSQL 18 |
| Kiểm thử | pytest, Vitest, React Testing Library, Playwright; GitHub Actions |
| Môi trường | PostgreSQL cài trực tiếp trên Windows khi phát triển; đóng gói Docker ở giai đoạn deploy |
