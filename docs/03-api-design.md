# 03 – Thiết kế API

- Base URL: `/api/v1`. Định dạng: JSON, UTF-8.
- Tài liệu tương tác: Swagger UI tại `/docs`, OpenAPI tại `/openapi.json`. FastAPI sinh tự động; khi có khác biệt thì schema trong Swagger là nguồn chính xác nhất.
- Tài liệu này mô tả quy ước chung, danh sách endpoint, và đặc tả chi tiết các API nghiệp vụ quan trọng.

## 1. Quy ước chung

### 1.1 Xác thực

| Thành phần | Cơ chế |
|---|---|
| Access token | JWT HS256, hết hạn sau 15 phút. Gửi qua header `Authorization: Bearer <token>`. Frontend chỉ giữ trong bộ nhớ. |
| Refresh token | Chuỗi ngẫu nhiên 256 bit, hết hạn sau 7 ngày. Nằm trong cookie `refresh_token` với `HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth`. DB chỉ lưu SHA-256 của token. Mỗi lần refresh thì thu hồi token cũ và cấp token mới (rotation). |
| CSRF | Cookie chỉ được gửi tới `/auth/refresh` và `/auth/logout`. Hai endpoint này kiểm tra header `Origin` thuộc `CORS_ORIGINS`. Các API còn lại dùng Bearer nên không bị CSRF. |

Khi tải lại trang, frontend gọi `POST /auth/refresh` để lấy access token mới. Khi nhận 401 `TOKEN_EXPIRED`, frontend tự refresh một lần rồi gửi lại request.

### 1.2 Phân trang, tìm kiếm, sắp xếp

| Tham số | Ý nghĩa | Mặc định |
|---|---|---|
| `page` | Trang, bắt đầu từ 1 | 1 |
| `page_size` | Số bản ghi mỗi trang, tối đa 100 | 20 |
| `q` | Từ khóa tìm kiếm (mỗi endpoint quy định tìm trên trường nào) | |
| `sort` | Tên trường; thêm tiền tố `-` để sắp giảm dần. Chỉ chấp nhận các trường trong whitelist. | `-created_at` |
| `date_from`, `date_to` | Ngày `YYYY-MM-DD` theo giờ VN, bao gồm cả hai đầu | |

Response danh sách:

```json
{ "items": [ ... ], "page": 1, "page_size": 20, "total": 134 }
```

### 1.3 Kiểu dữ liệu

- Tiền tệ được trả về dạng **chuỗi số** (`"54000.00"`) để không mất độ chính xác khi JavaScript đọc. Request chấp nhận cả số lẫn chuỗi.
- Thời gian theo ISO 8601 có múi giờ: `"2026-10-25T09:15:00+07:00"`.

### 1.4 Lỗi

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Dữ liệu không hợp lệ",
    "details": [ { "field": "sku", "message": "SKU chỉ gồm chữ, số, '-' và '_'" } ] } }
```

| HTTP | Khi nào |
|---|---|
| 200 / 201 | Thành công / tạo mới thành công |
| 204 | Thành công, không có nội dung trả về |
| 400 | Request sai cú pháp |
| 401 | Chưa đăng nhập, hoặc token hết hạn/không hợp lệ |
| 403 | Không đủ quyền / vượt giới hạn giảm giá / tài khoản bị khóa |
| 404 | Không tìm thấy |
| 409 | Xung đột nghiệp vụ: trùng, hết hàng, sai trạng thái |
| 413 | Request/file quá lớn |
| 422 | Dữ liệu không hợp lệ |
| 429 | Quá nhiều request |
| 500 | Lỗi hệ thống (chỉ trả `INTERNAL_ERROR` kèm `request_id`, không có stack trace) |

Mỗi response đều có header `X-Request-ID` để đối chiếu với log server.

### 1.5 Idempotency

`POST /orders` và `POST /orders/{id}/returns` **bắt buộc** có header `Idempotency-Key: <uuid v4>`:

- Key mới: xử lý bình thường và trả 201.
- Key đã dùng, cùng người tạo: trả lại bản ghi đã tạo, mã 200.
- Key đã dùng nhưng nội dung khác hoặc người khác: trả 409 `IDEMPOTENCY_CONFLICT`.

## 2. Danh sách endpoint

Ký hiệu quyền: **A** = Admin, **M** = Manager, **C** = Cashier.

### Auth

| Method | URL | Mô tả | Quyền |
|---|---|---|---|
| POST | `/auth/login` | Đăng nhập | Công khai (có rate limit) |
| POST | `/auth/refresh` | Lấy access token mới từ cookie | Cookie |
| POST | `/auth/logout` | Thu hồi refresh token, xóa cookie | Cookie |
| GET | `/auth/me` | Thông tin người dùng hiện tại + danh sách quyền | A M C |
| PATCH | `/auth/me` | Cập nhật họ tên, email, SĐT của chính mình | A M C |
| POST | `/auth/change-password` | Đổi mật khẩu | A M C |

### Users và hệ thống

| Method | URL | Mô tả | Quyền |
|---|---|---|---|
| GET | `/roles` | Danh sách vai trò | A |
| GET | `/users` | Danh sách (`q`, `role`, `is_active`) | A |
| POST | `/users` | Tạo tài khoản | A |
| GET | `/users/{id}` | Chi tiết | A |
| PATCH | `/users/{id}` | Sửa thông tin, vai trò | A |
| PATCH | `/users/{id}/status` | Khóa/mở khóa `{ "is_active": false }` | A |
| POST | `/users/{id}/reset-password` | Admin đặt mật khẩu mới | A |
| GET | `/settings` | Xem cấu hình | A M C (C chỉ thấy thông tin cửa hàng và giới hạn giảm giá của mình) |
| PATCH | `/settings` | Sửa cấu hình | A |
| GET | `/audit-logs` | Nhật ký (`user_id`, `action`, `entity_type`, `date_from`, `date_to`) | A |

### Danh mục, thương hiệu, sản phẩm

| Method | URL | Mô tả | Quyền |
|---|---|---|---|
| GET | `/categories` | Danh sách (`q`, `is_active`, `parent_id`; `tree=true` trả dạng cây) | A M C |
| POST | `/categories` | Tạo | A M |
| GET | `/categories/{id}` | Chi tiết | A M C |
| PATCH | `/categories/{id}` | Sửa, ngừng sử dụng (`is_active`) | A M |
| GET | `/brands` | Danh sách | A M C |
| POST | `/brands` | Tạo | A M |
| PATCH | `/brands/{id}` | Sửa, ngừng sử dụng | A M |
| GET | `/products` | Danh sách (`q` tìm theo tên/SKU/barcode, `category_id`, `brand_id`, `is_active`, `low_stock`; sort: `name`, `sku`, `sale_price`, `quantity`, `created_at`) | A M C |
| POST | `/products` | Tạo (đồng thời tạo dòng inventory với SL 0) | A M |
| GET | `/products/{id}` | Chi tiết, kèm `quantity` và `avg_cost` (avg_cost chỉ trả khi có `cost.view`) | A M C |
| PATCH | `/products/{id}` | Sửa (không có trường tồn kho), ngừng kinh doanh | A M |
| POST | `/products/{id}/image` | Upload ảnh (multipart, ≤ 2MB, JPEG/PNG/WebP) | A M |
| GET | `/products/{id}/inventory` | Tồn hiện tại + 20 biến động gần nhất | A M C |

### Nhà cung cấp, khách hàng

| Method | URL | Mô tả | Quyền |
|---|---|---|---|
| GET | `/suppliers` | Danh sách (`q` tìm theo mã/tên/SĐT, `is_active`) | A M |
| POST | `/suppliers` | Tạo (mã tự sinh) | A M |
| GET | `/suppliers/{id}` | Chi tiết | A M |
| PATCH | `/suppliers/{id}` | Sửa, ngừng hợp tác | A M |
| GET | `/customers` | Danh sách (`q` tìm theo mã/tên/SĐT), kèm `order_count` và `total_spent` | A M C |
| POST | `/customers` | Tạo (mã tự sinh) | A M C |
| GET | `/customers/{id}` | Chi tiết + thống kê | A M C |
| PATCH | `/customers/{id}` | Sửa | A M C |
| GET | `/customers/{id}/orders` | Lịch sử đơn (phân trang) | A M C |

### Nhập hàng

| Method | URL | Mô tả | Quyền |
|---|---|---|---|
| GET | `/purchases` | Danh sách (`q` theo mã, `supplier_id`, `status`, `date_from`, `date_to`) | A M |
| POST | `/purchases` | Tạo phiếu nháp | A M |
| GET | `/purchases/{id}` | Chi tiết kèm các dòng hàng | A M |
| PUT | `/purchases/{id}` | Thay toàn bộ nội dung phiếu (chỉ khi DRAFT) | A M |
| POST | `/purchases/{id}/confirm` | Xác nhận, cộng kho | A M |
| POST | `/purchases/{id}/cancel` | Hủy phiếu nháp | A M |

### Bán hàng, hoàn trả

| Method | URL | Mô tả | Quyền |
|---|---|---|---|
| GET | `/orders` | Danh sách (`q` theo mã/SĐT khách, `status`, `customer_id`, `created_by`, `payment_method`, `date_from`, `date_to`) | A M C |
| POST | `/orders` | Tạo đơn + thanh toán (bắt buộc Idempotency-Key) | A M C |
| GET | `/orders/{id}` | Chi tiết: dòng hàng, thanh toán, phiếu trả, SL còn trả được | A M C |
| POST | `/orders/{id}/cancel` | Hủy đơn | A M |
| POST | `/orders/{id}/returns` | Tạo phiếu trả (bắt buộc Idempotency-Key) | A M C |
| GET | `/returns` | Danh sách phiếu trả (`q`, `date_from`, `date_to`) | A M C |
| GET | `/returns/{id}` | Chi tiết phiếu trả | A M C |

### Kho

| Method | URL | Mô tả | Quyền |
|---|---|---|---|
| GET | `/inventory` | Tồn kho theo sản phẩm (`q`, `category_id`, `low_stock`, `out_of_stock`); kèm giá trị tồn khi có `cost.view` | A M C |
| GET | `/inventory/transactions` | Lịch sử (`product_id`, `type`, `date_from`, `date_to`) | A M |
| POST | `/inventory/adjustments` | Điều chỉnh / kiểm kê | A M |
| GET | `/inventory/adjustments` | Danh sách phiếu điều chỉnh | A M |
| GET | `/inventory/adjustments/{id}` | Chi tiết | A M |

### Báo cáo

Mọi báo cáo dạng bảng đều hỗ trợ `format=csv`. Khi đó response có `Content-Type: text/csv; charset=utf-8` (kèm BOM để Excel đọc đúng tiếng Việt).

| Method | URL | Mô tả | Quyền |
|---|---|---|---|
| GET | `/reports/dashboard` | KPI + biểu đồ + top SP + đơn gần đây + cảnh báo (`date_from`, `date_to`, `group_by=day\|week\|month`) | A M |
| GET | `/reports/revenue` | Doanh thu gộp, hoàn trả, doanh thu thuần, số đơn, COGS, lợi nhuận gộp theo kỳ | A M |
| GET | `/reports/top-products` | Top sản phẩm (`date_from`, `date_to`, `limit`, `by=quantity\|revenue`) | A M |
| GET | `/reports/inventory` | Tồn kho, giá trị tồn, hàng sắp hết (`low_stock`) | A M |
| GET | `/reports/purchases-by-supplier` | Tổng nhập theo nhà cung cấp | A M |
| GET | `/reports/my-sales` | Doanh số trong ngày của chính người gọi | A M C |

## 3. Đặc tả chi tiết các API quan trọng

### 3.1 `POST /auth/login`

Request:

```json
{ "username": "admin", "password": "Admin@123" }
```

| Trường | Quy tắc |
|---|---|
| username | Bắt buộc, 3–50 ký tự |
| password | Bắt buộc, 1–128 ký tự |

Response `200` (kèm header `Set-Cookie: refresh_token=...; HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth; Max-Age=604800`):

```json
{
  "access_token": "eyJhbGciOi...",
  "token_type": "bearer",
  "expires_in": 900,
  "user": { "id": 1, "username": "admin", "full_name": "Nguyễn Văn A", "role": "ADMIN",
            "permissions": ["users.manage", "catalog.manage", "..."] }
}
```

Lỗi: `401 INVALID_CREDENTIALS`, `403 ACCOUNT_DISABLED`, `403 ACCOUNT_LOCKED` (`details.locked_until`), `429 RATE_LIMITED` (10 lần/phút/IP), `422`.

Xử lý: so sánh hash Argon2. Khi sai thì tăng `failed_login_count`; tới 5 lần thì đặt `locked_until = now + 15 phút`. Khi đúng thì reset bộ đếm, cập nhật `last_login_at`. Ghi audit `LOGIN_SUCCESS` hoặc `LOGIN_FAILED` (không ghi mật khẩu). Nếu username không tồn tại, backend vẫn chạy hash giả để thời gian phản hồi không tiết lộ user có tồn tại hay không.

### 3.2 `POST /products`

Request:

```json
{
  "sku": "sua-th-1l", "barcode": "8935217400133", "name": "Sữa tươi TH True Milk 1L",
  "category_id": 3, "brand_id": 2, "unit": "hộp", "sale_price": "32000",
  "min_stock": 10, "description": "Sữa tươi tiệt trùng ít đường", "is_active": true
}
```

| Trường | Quy tắc |
|---|---|
| sku | Bắt buộc. Được chuẩn hóa thành `SUA-TH-1L`, regex `^[A-Z0-9_-]{1,50}$`, duy nhất |
| barcode | Tùy chọn, 4–50 chữ số/ký tự, duy nhất |
| name | Bắt buộc, 1–255 ký tự, cắt khoảng trắng hai đầu |
| category_id | Bắt buộc, phải tồn tại và đang hoạt động |
| brand_id | Tùy chọn, phải tồn tại |
| unit | Bắt buộc, 1–20 ký tự |
| sale_price | Bắt buộc, 0 ≤ giá ≤ 999.999.999.999 |
| min_stock | Số nguyên ≥ 0, mặc định 0 |

Response `201`:

```json
{
  "id": 12, "sku": "SUA-TH-1L", "barcode": "8935217400133", "name": "Sữa tươi TH True Milk 1L",
  "category": { "id": 3, "name": "Sữa" }, "brand": { "id": 2, "name": "TH True Milk" },
  "unit": "hộp", "sale_price": "32000.00", "min_stock": 10, "image_url": null,
  "description": "...", "is_active": true, "quantity": 0, "avg_cost": "0.0000",
  "created_at": "2026-10-25T09:00:00+07:00", "updated_at": "2026-10-25T09:00:00+07:00"
}
```

Lỗi: `409 DUPLICATE_SKU`, `409 DUPLICATE_BARCODE`, `422 VALIDATION_ERROR`, `403 FORBIDDEN`.

`PATCH /products/{id}` nhận cùng các trường nhưng đều là tùy chọn. Nếu request có gửi `quantity` hoặc `avg_cost` thì bị từ chối với 422, vì schema cấm trường lạ (`extra="forbid"`).

### 3.3 `POST /purchases` và `PUT /purchases/{id}`

Request:

```json
{
  "supplier_id": 4,
  "note": "Nhập hàng đầu tuần",
  "items": [
    { "product_id": 12, "quantity": 20, "unit_cost": "9500", "discount_amount": "0" },
    { "product_id": 15, "quantity": 24, "unit_cost": "5000", "discount_amount": "12000" }
  ]
}
```

Quy tắc kiểm tra:
- Nhà cung cấp đang hoạt động.
- Có từ 1 đến 200 dòng, không trùng `product_id`.
- Sản phẩm đang kinh doanh.
- `quantity` từ 1 đến 1.000.000.
- `unit_cost ≥ 0`, và `0 ≤ discount_amount ≤ quantity × unit_cost`.

Response `201`: phiếu ở trạng thái `DRAFT`, `total_amount = "298000.00"`, kèm `items[].line_total`. Backend tự tính toàn bộ.

`PUT` chỉ thực hiện được khi phiếu ở `DRAFT`; ngược lại trả `409 INVALID_STATE`.

### 3.4 `POST /purchases/{id}/confirm`

Không có body. Response `200`: phiếu `CONFIRMED`, kèm `confirmed_by`, `confirmed_at`.

Xử lý (1 transaction): đổi trạng thái có điều kiện `WHERE status='DRAFT'` → khóa inventory → tính WAC → cộng tồn → ghi `inventory_transactions` → audit.

Lỗi:
- `409 INVALID_STATE`: phiếu đã xác nhận hoặc đã hủy. Cũng là kết quả khi bấm "Xác nhận" lần thứ hai.
- `409 PRODUCT_INACTIVE`: có sản phẩm đã ngừng kinh doanh sau khi tạo nháp.
- `404`.

### 3.5 `POST /orders`

Header: `Idempotency-Key: 5f0c2c1e-...`

Request:

```json
{
  "customer_id": 8,
  "items": [ { "product_id": 12, "quantity": 5 }, { "product_id": 15, "quantity": 2 } ],
  "discount": { "type": "PERCENT", "value": "10" },
  "payment": { "method": "CASH", "cash_received": "200000" },
  "note": null
}
```

| Trường | Quy tắc |
|---|---|
| customer_id | Tùy chọn (null = khách lẻ); nếu có thì phải tồn tại |
| items | 1–100 dòng, không trùng sản phẩm, `quantity` 1–10.000 |
| discount | Tùy chọn. `type` là `AMOUNT` hoặc `PERCENT`. Với PERCENT: 0–100. Với AMOUNT: ≤ subtotal. Tỷ lệ giảm thực tế ≤ giới hạn vai trò |
| payment.method | `CASH`, `BANK_TRANSFER`, `CARD` |
| payment.cash_received | Bắt buộc khi CASH, phải ≥ total |
| payment.reference_note | Tùy chọn, dùng cho chuyển khoản/thẻ |

**Không có trường giá hay tổng tiền nào được gửi lên.** Nếu client gửi `unit_price` hoặc `total` thì bị từ chối với 422.

Response `201`:

```json
{
  "id": 207, "code": "HD20261025-0007", "status": "COMPLETED", "return_status": "NONE",
  "customer": { "id": 8, "code": "KH000008", "name": "Trần Thị B", "phone": "0901234567" },
  "items": [
    { "id": 501, "product_id": 12, "sku": "SUA-TH-1L", "product_name": "Sữa tươi TH True Milk 1L",
      "unit": "hộp", "quantity": 5, "unit_price": "32000.00", "line_subtotal": "160000.00",
      "discount_allocated": "16000.00", "line_total": "144000.00", "returnable_quantity": 5 }
  ],
  "subtotal": "180000.00", "discount_amount": "18000.00", "total_amount": "162000.00",
  "payments": [ { "type": "PAYMENT", "method": "CASH", "amount": "162000.00",
                  "cash_received": "200000.00", "change_amount": "38000.00" } ],
  "created_by": { "id": 3, "full_name": "Lê Văn C" },
  "created_at": "2026-10-25T10:12:00+07:00"
}
```

Lỗi:
- `409 OUT_OF_STOCK` (`details: [{product_id, requested, available}]`)
- `409 PRODUCT_INACTIVE`
- `403 DISCOUNT_EXCEEDS_LIMIT` (`details.max_percent`)
- `422 INSUFFICIENT_PAYMENT`
- `409 IDEMPOTENCY_CONFLICT`
- `400` nếu thiếu Idempotency-Key

Nếu gửi lại cùng key, backend trả `200` với đúng đơn đã tạo.

### 3.6 `POST /orders/{id}/cancel`

Request: `{ "reason": "Khách đổi ý trước khi rời quầy" }` (lý do 3–255 ký tự).

Response `200`: đơn ở `CANCELLED`, kèm payment REFUND.

Lỗi:
- `409 INVALID_STATE`: đơn đã hủy.
- `409 CANCEL_NOT_ALLOWED`: đã có phiếu trả, hoặc không phải ngày bán (`details.reason` là `HAS_RETURNS` hoặc `NOT_SAME_DAY`).
- `403`.

### 3.7 `POST /orders/{id}/returns`

Header: `Idempotency-Key`.

Request:

```json
{
  "reason": "Sản phẩm bị móp hộp",
  "items": [
    { "order_item_id": 501, "quantity": 2, "condition": "RESELLABLE" },
    { "order_item_id": 502, "quantity": 1, "condition": "DAMAGED" }
  ]
}
```

Quy tắc kiểm tra:
- `order_item_id` phải thuộc đơn `{id}`, không trùng nhau.
- `quantity ≥ 1` và ≤ SL còn trả được.
- `condition` là `RESELLABLE` hoặc `DAMAGED`.
- Đơn ở `COMPLETED` và còn trong hạn trả.

Response `201`:

```json
{
  "id": 31, "code": "TH20261025-0002", "sales_order": { "id": 207, "code": "HD20261025-0007" },
  "reason": "Sản phẩm bị móp hộp",
  "items": [ { "order_item_id": 501, "product_name": "Sữa tươi TH True Milk 1L", "quantity": 2,
               "condition": "RESELLABLE", "refund_amount": "57600.00" } ],
  "total_refund": "...", "refund_method": "CASH",
  "created_at": "2026-10-25T15:40:00+07:00"
}
```

Lỗi: `409 RETURN_QUANTITY_EXCEEDED`, `409 RETURN_PERIOD_EXPIRED`, `409 INVALID_STATE` (đơn đã hủy), `422`.

### 3.8 `POST /inventory/adjustments`

Điều chỉnh:

```json
{ "type": "ADJUSTMENT", "reason": "Vỡ 3 chai khi sắp xếp kệ",
  "items": [ { "product_id": 20, "quantity_change": -3 } ] }
```

Kiểm kê:

```json
{ "type": "STOCKTAKE", "reason": "Kiểm kê cuối tháng 10",
  "items": [ { "product_id": 12, "counted_quantity": 26 }, { "product_id": 15, "counted_quantity": 40 } ] }
```

- `ADJUSTMENT` bắt buộc `quantity_change ≠ 0`. `STOCKTAKE` bắt buộc `counted_quantity ≥ 0`. Các dòng không có chênh lệch được bỏ qua; nếu không còn dòng nào thì trả 422.
- Lỗi: `409 NEGATIVE_STOCK`, `422`.
- Response `201`: phiếu `DC…` kèm `quantity_before` và `quantity_change` của từng dòng.

### 3.9 `GET /reports/dashboard?date_from=2026-10-01&date_to=2026-10-25&group_by=day`

Response `200`:

```json
{
  "period": { "date_from": "2026-10-01", "date_to": "2026-10-25" },
  "kpis": {
    "gross_revenue": "48250000.00", "refunds": "320000.00", "net_revenue": "47930000.00",
    "order_count": 412, "gross_profit": "9120000.00",
    "today_revenue": "2150000.00", "today_order_count": 18,
    "active_product_count": 236, "low_stock_count": 7, "inventory_value": "85400000.00"
  },
  "revenue_series": [ { "period": "2026-10-01", "net_revenue": "1850000.00", "gross_profit": "350000.00", "order_count": 16 } ],
  "top_products": [ { "product_id": 12, "name": "Sữa tươi TH True Milk 1L", "quantity": 140, "revenue": "4480000.00" } ],
  "recent_orders": [ { "id": 207, "code": "HD20261025-0007", "customer_name": "Trần Thị B", "total_amount": "162000.00", "status": "COMPLETED", "created_at": "..." } ],
  "low_stock_items": [ { "product_id": 20, "sku": "NUOC-SUOI-500", "name": "Nước suối 500ml", "quantity": 3, "min_stock": 24 } ]
}
```

Các trường `today_*`, `active_product_count`, `low_stock_count`, `inventory_value` luôn tính tại thời điểm hiện tại, không phụ thuộc bộ lọc.

Quy tắc: khoảng thời gian tối đa 366 ngày; `date_from ≤ date_to`. Mọi số liệu tính theo định nghĩa ở [01-business-spec.md §7.7](01-business-spec.md).

> Dữ liệu trong các ví dụ trên chỉ để minh họa định dạng.
