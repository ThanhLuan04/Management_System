# Tài liệu thiết kế SmartStore

| File | Nội dung |
|---|---|
| [01-business-spec.md](01-business-spec.md) | Bài toán, vai trò, phân quyền, use case, luồng nghiệp vụ, quy tắc, mã lỗi, phạm vi MVP |
| [02-database-design.md](02-database-design.md) | ERD, chi tiết bảng/ràng buộc/index, dữ liệu thay đổi theo nghiệp vụ, xử lý đồng thời |
| [03-api-design.md](03-api-design.md) | Quy ước REST, xác thực, phân trang, danh sách endpoint, đặc tả API chính |
| [04-project-structure.md](04-project-structure.md) | Cấu trúc thư mục và trách nhiệm từng phần |
| [05-ui-design-system.md](05-ui-design-system.md) | Design system, trạng thái hiển thị, wireframe |

## Công nghệ đã chốt

| Lớp | Công nghệ |
|---|---|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS, shadcn/ui, TanStack Query, React Hook Form, Zod, Recharts |
| Backend | Python 3.12, FastAPI, Pydantic v2, SQLAlchemy 2.0, Alembic, Argon2, PyJWT |
| Database | PostgreSQL 18 |
| Kiểm thử | pytest, httpx, Vitest, React Testing Library, MSW, Playwright |
| Môi trường | PostgreSQL cài trực tiếp trên Windows khi phát triển; Docker Compose cho môi trường đóng gói |
