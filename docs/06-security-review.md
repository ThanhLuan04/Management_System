# Rà soát bảo mật cơ bản (giai đoạn 7)

Ngày rà soát: 2026-10-27. Đối chiếu với yêu cầu bảo mật §10 của đặc tả.
Cột "Bằng chứng" chỉ ghi những gì đã thực sự chạy/kiểm tra; mục chưa làm được ghi rõ ở cuối.

## Kết quả theo yêu cầu

| Yêu cầu | Cách đáp ứng | Bằng chứng |
|---|---|---|
| Mật khẩu băm Argon2 | `argon2-cffi`, không lưu/ghi log mật khẩu gốc | pytest `tests/unit/test_security.py`; quét log: không có lệnh log nào chứa password/token |
| Phân quyền kiểm tra ở backend | `require_permission` trên từng endpoint; giao diện chỉ ẩn menu | pytest (403 theo vai trò); E2E `auth.spec.ts`: thu ngân gọi thẳng API quản trị → 403, không thấy giá vốn |
| Validate input bằng schema | Pydantic v2 (backend), Zod (frontend) | pytest lỗi 422 có định dạng chuẩn, không lặp lại giá trị nhập |
| Không commit secret | `.env` trong `.gitignore`, có `.env.example` | `git log --all -- backend/.env` rỗng; `git grep` chỉ thấy mật khẩu demo/test (xem ghi chú) |
| CORS allowlist | `CORS_ORIGINS`, không dùng `*` khi có credentials | pytest `test_cors_allows_only_configured_origins` (origin lạ không nhận `Access-Control-Allow-Origin`) |
| Cookie an toàn | Refresh token: `HttpOnly`, `Secure`, `SameSite=Strict`, path `/api/v1/auth`; DB chỉ lưu SHA-256 | E2E kiểm tra thuộc tính cookie; pytest xoay vòng token, phát hiện dùng lại token cũ |
| CSRF | Access token gửi qua header `Authorization` (không phải cookie); refresh/logout kiểm tra `Origin` + SameSite=Strict | pytest refresh từ origin lạ → 403 |
| Không lộ stack trace | Middleware bắt lỗi → `INTERNAL_ERROR` + request_id; chi tiết chỉ có trong log server | pytest `test_unhandled_exception_returns_generic_500_without_stack_trace` |
| Audit log | Thao tác quan trọng (người dùng, giá, kho, hủy đơn, trả hàng, cài đặt) ghi `audit_logs` | pytest audit theo từng nghiệp vụ |
| Giới hạn đăng nhập | 10 lần/phút/IP; khóa tài khoản 15 phút sau 5 lần sai | pytest rate limit và khóa tài khoản |
| Giới hạn upload | ≤ 2MB, kiểm tra nội dung file thật (không tin tên/Content-Type), tên file ngẫu nhiên | pytest upload file giả ảnh, file quá lớn, thu ngân upload → 403 |
| JWT | Ghim thuật toán (`algorithms=[...]`), bắt buộc `sub`/`exp`/`type`, hết hạn 15 phút | Đọc code `app/core/security.py`; pytest token hết hạn / không hợp lệ |
| SQL injection | Truy vấn qua SQLAlchemy có tham số | `ruff --select S` (bandit) trên `app/`: 0 cảnh báo |

## Phát hiện và đã sửa trong lần rà soát này

- **Thiếu header bảo mật.** Backend không gửi header nào; ảnh ở `/uploads` có thể bị trình duyệt đoán sai kiểu nội dung.
  Đã thêm vào mọi response: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`,
  `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'` (trừ `/docs` vì Swagger UI cần tải script).
  Có test cho cả response thường, lỗi 500 và trang `/docs`.

## Cảnh báo công cụ đã xem và đánh giá là không phải lỗi

`ruff --select S` báo 7 mục, tất cả nằm ngoài code ứng dụng hoặc là báo nhầm:
- `token_type = "bearer"` (S105): tên loại token theo chuẩn OAuth2, không phải mật khẩu.
- `DEMO_PASSWORD` trong `scripts/seed_demo.py` (S105): tài khoản demo; script từ chối chạy khi `ENVIRONMENT=production`.
- Mật khẩu Admin E2E trong `scripts/e2e_server.py` (S106): chỉ tạo trên database `_test`, bị xóa mỗi lần chạy.
- SQL ghép chuỗi trong `seed_demo.py` (S608): chỉ ghép tên bảng cố định trong code, không có dữ liệu người dùng.
- `random` trong `seed_demo.py` (S311): sinh dữ liệu demo, không dùng cho mục đích bảo mật.

## Quét thư viện phụ thuộc

- Frontend: `npm audit` → 0 lỗ hổng.
- Backend: **chưa chạy được** `pip-audit` trên máy phát triển (lỗi xác thực chứng chỉ SSL khi gọi pypi.org từ Python).
  Không tắt kiểm tra SSL để vượt qua; `pip-audit` chạy trong GitHub Actions cho mỗi lần push.

## Đóng gói Docker (bổ sung sau rà soát)

Cấu hình trong `docker-compose.yml` và `frontend/Caddyfile`; CI dựng cả cụm và kiểm tra các mục dưới.
- Caddy: tự lấy chứng chỉ HTTPS và chuyển HTTP → HTTPS khi có tên miền; gắn HSTS, CSP cho trang frontend
  (`script-src 'self'`; style cho phép inline vì Recharts/sonner gắn style trực tiếp), `X-Frame-Options`,
  `Permissions-Policy`; giới hạn kích thước request.
- Chỉ Caddy mở cổng; backend và PostgreSQL chỉ nằm trong mạng nội bộ Docker (CI kiểm tra cổng 8000/5432 đóng).
- Backend chạy bằng user thường (không phải root), 1 worker, `--proxy-headers` để giới hạn đăng nhập theo IP thật.
- `ENVIRONMENT=production`: tắt Swagger/OpenAPI (CI kiểm tra 404), script dữ liệu demo từ chối chạy.
- Bí mật (`POSTGRES_PASSWORD`, `JWT_SECRET_KEY`) lấy từ `.env` không commit; compose báo lỗi nếu thiếu.

## Việc còn lại khi deploy lên máy chủ thật

- Đặt mật khẩu database và `JWT_SECRET_KEY` ngẫu nhiên, mạnh; không tạo tài khoản demo trên production.
- Cài cron chạy `scripts/backup_db.sh` hằng ngày và thử khôi phục định kỳ; nên chép bản sao lưu ra ngoài máy chủ.
- Rate limit hiện lưu trong bộ nhớ một tiến trình — nếu chạy nhiều worker/instance cần chuyển sang Redis.
