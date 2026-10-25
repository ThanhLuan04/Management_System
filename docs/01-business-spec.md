# 01 – Đặc tả nghiệp vụ SmartStore

> Phiên bản: 1.0 (MVP) · Cập nhật: 25/10/2026
> Tiền tệ: VND · Múi giờ: Asia/Ho_Chi_Minh · Ngôn ngữ giao diện: Tiếng Việt

## 1. Mô tả bài toán

Một cửa hàng bán lẻ nhỏ/vừa (một cửa hàng, một kho) đang quản lý hàng hóa bằng sổ sách hoặc Excel, dẫn đến:

- Không biết chính xác tồn kho hiện tại, hay bán hết hàng mà không biết.
- Không truy vết được vì sao số lượng tồn thay đổi.
- Không tính được lợi nhuận thực tế vì giá nhập thay đổi theo từng lần nhập.
- Thu ngân có thể giảm giá tùy ý, khó kiểm soát đổi trả.

SmartStore là website quản lý bán hàng giúp cửa hàng quản lý sản phẩm, nhập hàng, tồn kho, bán hàng tại quầy (POS), hoàn trả, khách hàng, nhân viên và báo cáo kinh doanh dựa trên dữ liệu thật.

## 2. Đối tượng sử dụng

| Vai trò | Mô tả | Nhu cầu chính |
|---|---|---|
| **Admin** (Quản trị viên) | Chủ cửa hàng / người phụ trách hệ thống | Toàn quyền, quản lý tài khoản, xem audit log, cấu hình |
| **Manager** (Quản lý) | Quản lý cửa hàng | Nhập hàng, kho, đơn hàng, khách hàng, báo cáo |
| **Cashier** (Thu ngân) | Nhân viên bán hàng | Bán hàng nhanh, tra cứu, đổi trả trong giới hạn |

## 3. Ma trận phân quyền

Quyền được định nghĩa bằng mã (permission code) trong backend; mỗi vai trò có một tập quyền cố định. **Mọi endpoint đều kiểm tra quyền ở backend.**

| Mã quyền | Mô tả | Admin | Manager | Cashier |
|---|---|:-:|:-:|:-:|
| `users.manage` | Quản lý tài khoản, vai trò, khóa/mở | ✅ | | |
| `settings.manage` | Cấu hình cửa hàng, chính sách | ✅ | | |
| `audit.view` | Xem nhật ký kiểm toán | ✅ | | |
| `catalog.view` | Xem sản phẩm, danh mục, thương hiệu | ✅ | ✅ | ✅ |
| `catalog.manage` | Thêm/sửa sản phẩm, danh mục, thương hiệu | ✅ | ✅ | |
| `suppliers.manage` | Xem/thêm/sửa nhà cung cấp | ✅ | ✅ | |
| `purchases.manage` | Tạo, sửa nháp, xác nhận, hủy phiếu nhập | ✅ | ✅ | |
| `inventory.view` | Xem tồn kho, lịch sử kho | ✅ | ✅ | ✅ (chỉ số lượng) |
| `inventory.adjust` | Điều chỉnh kho, kiểm kê | ✅ | ✅ | |
| `customers.view` | Tra cứu khách hàng | ✅ | ✅ | ✅ |
| `customers.manage` | Thêm/sửa khách hàng | ✅ | ✅ | ✅ (thêm, sửa liên hệ) |
| `orders.create` | Bán hàng tại POS | ✅ | ✅ | ✅ |
| `orders.view` | Xem danh sách/chi tiết đơn | ✅ | ✅ | ✅ |
| `orders.cancel` | Hủy đơn | ✅ | ✅ | |
| `returns.create` | Tạo phiếu hoàn trả | ✅ | ✅ | ✅ |
| `reports.view` | Báo cáo doanh thu, lợi nhuận, tồn kho | ✅ | ✅ | |
| `reports.own_sales` | Xem doanh số của chính mình | ✅ | ✅ | ✅ |
| `cost.view` | Xem giá vốn, lợi nhuận | ✅ | ✅ | |

Giới hạn giảm giá trên một đơn: Cashier ≤ **10%**, Manager ≤ **30%**, Admin không giới hạn. Các mức này cấu hình được trong Cài đặt.

> Cashier **không thấy giá vốn**: backend loại bỏ các trường `avg_cost`, `unit_cost`, `gross_profit` khỏi response nếu người dùng không có quyền `cost.view`.

## 4. Danh sách chức năng (theo module)

| Module | Chức năng |
|---|---|
| auth | Đăng nhập, đăng xuất, làm mới phiên, đổi mật khẩu, xem/cập nhật hồ sơ |
| users | Danh sách, tạo, sửa, đổi vai trò, khóa/mở khóa, đặt lại mật khẩu |
| categories | CRUD (không xóa cứng), danh mục cha – con (tối đa 2 cấp) |
| brands | Thêm, sửa, ngừng sử dụng thương hiệu |
| products | CRUD, ngừng kinh doanh, tìm theo tên/SKU/barcode, lọc, phân trang, sắp xếp, upload ảnh, xem tồn kho |
| suppliers | CRUD (không xóa cứng), tìm kiếm |
| customers | CRUD, tìm theo tên/SĐT, lịch sử mua hàng, tổng chi tiêu |
| purchases | Tạo phiếu nháp, sửa nháp, xác nhận nhập kho, hủy nháp, tra cứu |
| inventory | Tồn kho, cảnh báo tồn thấp, lịch sử biến động, điều chỉnh, kiểm kê |
| sales | POS, tạo đơn + thanh toán, danh sách, chi tiết, in hóa đơn, hủy đơn |
| returns | Hoàn trả một phần/toàn bộ, danh sách phiếu trả |
| reports | Dashboard, doanh thu, lợi nhuận, top sản phẩm, tồn kho, nhập hàng theo NCC, hàng sắp hết, xuất CSV |
| audit_logs | Ghi và tra cứu nhật ký thao tác quan trọng |
| settings | Thông tin cửa hàng, chính sách giảm giá, thời hạn đổi trả |

## 5. Use case chính

| Mã | Use case | Tác nhân |
|---|---|---|
| UC01 | Đăng nhập / đăng xuất / đổi mật khẩu | Tất cả |
| UC02 | Quản lý người dùng | Admin |
| UC03 | Quản lý sản phẩm, danh mục, thương hiệu | Admin, Manager |
| UC04 | Quản lý nhà cung cấp | Admin, Manager |
| UC05 | Quản lý khách hàng | Tất cả (giới hạn theo quyền) |
| UC06 | Nhập hàng (nháp → xác nhận) | Admin, Manager |
| UC07 | Bán hàng tại POS | Tất cả |
| UC08 | Hủy đơn hàng | Admin, Manager |
| UC09 | Hoàn trả hàng | Tất cả |
| UC10 | Điều chỉnh kho / kiểm kê | Admin, Manager |
| UC11 | Xem dashboard, báo cáo, xuất CSV | Admin, Manager |
| UC12 | Xem audit log, cấu hình hệ thống | Admin |

## 6. Luồng nghiệp vụ

### 6.1 UC06 – Nhập hàng

```
[Manager] Tạo phiếu nhập → chọn NCC → thêm SP, SL, đơn giá, chiết khấu
        → Lưu nháp (DRAFT)  ── có thể sửa / hủy (CANCELLED)
        → Xác nhận
              Backend (1 transaction):
              1. Khóa phiếu: UPDATE ... WHERE status='DRAFT'  (0 dòng → 409)
              2. Khóa các dòng inventory (FOR UPDATE, sắp theo product_id)
              3. Với mỗi dòng: tính avg_cost mới, cộng tồn
              4. Ghi inventory_transactions (type=PURCHASE)
              5. Ghi confirmed_by, confirmed_at, audit log
              → COMMIT  (lỗi bất kỳ → ROLLBACK, phiếu vẫn DRAFT)
```

### 6.2 UC07 – Bán hàng tại POS

```
[Cashier] Tìm SP (tên/SKU/quét barcode) → thêm vào giỏ → chỉnh SL
        → chọn khách hàng (hoặc khách lẻ) → nhập giảm giá
        → chọn phương thức thanh toán, nhập tiền khách đưa (tiền mặt)
        → Thanh toán  (request kèm Idempotency-Key sinh 1 lần cho mỗi giỏ)
              Backend (1 transaction):
              1. Nếu idempotency_key đã tồn tại → trả lại đơn cũ (200)
              2. Lấy giá bán hiện tại từ DB, kiểm tra SP còn kinh doanh
              3. Tính subtotal, kiểm tra giảm giá theo quyền, phân bổ giảm giá
              4. Khóa inventory (FOR UPDATE, sắp theo product_id), kiểm tra đủ tồn
              5. Tạo sales_orders + items (snapshot tên, SKU, giá bán, giá vốn)
              6. Trừ tồn, ghi inventory_transactions (type=SALE)
              7. Tạo payments (type=PAYMENT), tính tiền thừa
              → COMMIT → frontend hiển thị hóa đơn, xóa giỏ, sinh key mới
```

### 6.3 UC08 – Hủy đơn

Điều kiện: đơn `COMPLETED`, **chưa có phiếu trả nào**, và **hủy trong cùng ngày bán** (theo giờ Việt Nam). Đơn của ngày trước phải xử lý bằng hoàn trả, để báo cáo các ngày đã chốt không bị thay đổi.

```
Backend (1 transaction): UPDATE sales_orders SET status='CANCELLED' ... WHERE id=? AND status='COMPLETED'
  (0 dòng → 409) → khóa inventory → hoàn toàn bộ SL về kho theo unit_cost gốc
  → ghi inventory_transactions (ORDER_CANCEL) → payments (REFUND toàn bộ) → audit log
```

### 6.4 UC09 – Hoàn trả

```
[Cashier] Tìm đơn gốc → chọn dòng hàng, SL trả, tình trạng (Còn bán được / Hỏng) → lý do
        → Xác nhận (kèm Idempotency-Key)
              Backend (1 transaction):
              1. Khóa đơn gốc (FOR UPDATE) — tuần tự hóa các lần trả cùng đơn
              2. Kiểm tra: đơn COMPLETED, trong thời hạn 7 ngày,
                 SL trả ≤ SL bán − SL đã trả
              3. Tính tiền hoàn từng dòng
              4. Hàng "Còn bán được": cộng lại kho theo unit_cost gốc, tính lại avg_cost,
                 ghi inventory_transactions (SALE_RETURN). Hàng "Hỏng": không cộng kho.
              5. Tạo sales_returns + items, payments (REFUND), audit log
```

### 6.5 UC10 – Điều chỉnh kho / kiểm kê

- **Điều chỉnh:** chọn sản phẩm, nhập số lượng tăng/giảm (khác 0) và **lý do bắt buộc**, ví dụ hư hỏng, thất lạc hoặc sửa sai phiếu nhập.
- **Kiểm kê:** chọn danh sách sản phẩm, hệ thống hiện tồn trên sổ, người dùng nhập **số đếm thực tế**. Hệ thống tính chênh lệch và tạo phiếu điều chỉnh loại `STOCKTAKE`, chỉ gồm các dòng có chênh lệch.
- Cả hai đều chạy trong 1 transaction có khóa inventory và ghi lịch sử `ADJUSTMENT`. Không được giảm xuống dưới 0.
- Điều chỉnh không làm đổi `avg_cost`. Hàng tăng thêm được tính theo avg hiện tại.

## 7. Quy tắc nghiệp vụ

### 7.1 Sản phẩm và danh mục

- **BR-P01** SKU duy nhất, không phân biệt hoa thường. Hệ thống tự viết hoa và bỏ khoảng trắng; chỉ cho phép `A-Z 0-9 - _`, dài 1–50 ký tự.
- **BR-P02** Barcode (nếu có) là duy nhất.
- **BR-P03** Giá bán ≥ 0. Mức tồn tối thiểu là số nguyên ≥ 0.
- **BR-P04** Form sản phẩm **không có trường tồn kho**. Giá vốn hiển thị chỉ để xem (lấy từ `inventory.avg_cost`).
- **BR-P05** Không xóa sản phẩm. Chỉ chuyển trạng thái **Ngừng kinh doanh**. Sản phẩm ngừng kinh doanh không bán được ở POS và không thêm được vào phiếu nhập mới.
- **BR-P06** Danh mục tối đa 2 cấp. Tên danh mục duy nhất trong cùng một cha. Không ngừng sử dụng danh mục còn sản phẩm đang kinh doanh.
- **BR-P07** Số lượng trong MVP là **số nguyên**. Chưa hỗ trợ bán lẻ theo kg hoặc mét; đây là giới hạn đã biết.

### 7.2 Giá vốn – Bình quân gia quyền (WAC)

`inventory` lưu `quantity` và `avg_cost` của từng sản phẩm.

| Nghiệp vụ | Ảnh hưởng tồn | Ảnh hưởng avg_cost |
|---|---|---|
| Xác nhận nhập | `+SL` | `avg = (tồn×avg + SL×giá_nhập_thực) / (tồn+SL)`; nếu tồn = 0 → `avg = giá_nhập_thực` |
| Bán | `−SL` | Không đổi; `unit_cost = avg` được **lưu vào dòng đơn** |
| Hoàn trả (còn bán được) | `+SL` | Như nhập, với giá = `unit_cost` của dòng đơn gốc |
| Hoàn trả (hỏng) | Không đổi | Không đổi |
| Hủy đơn | `+SL` | Như hoàn trả |
| Điều chỉnh / kiểm kê | `±SL` | Không đổi |

- `giá_nhập_thực = thành_tiền_dòng / SL` (đã trừ chiết khấu dòng).
- `avg_cost` lưu 4 chữ số thập phân. Tiền bán hàng làm tròn đến **đồng**.
- **Không bao giờ** dùng `avg_cost` hiện tại để tính lại lợi nhuận đơn cũ.

Ví dụ: tồn 10 cái giá vốn 8.000 → nhập 20 cái giá 9.500 → avg = (80.000 + 190.000) / 30 = **9.000**. Bán 5 cái → mỗi dòng đơn lưu unit_cost = 9.000. Khách trả 2 cái còn tốt → tồn 27, avg = (25×9.000 + 2×9.000)/27 = 9.000.

### 7.3 Đơn hàng và thanh toán

- **BR-S01** Đơn POS tạo xong là `COMPLETED` (đã thanh toán đủ). MVP không có đơn nháp; giỏ hàng chỉ nằm ở frontend.
- **BR-S02** Frontend chỉ gửi `product_id`, `quantity`, giảm giá, phương thức thanh toán, tiền khách đưa. **Backend tự tính lại mọi khoản tiền** từ giá trong DB.
- **BR-S03** Không bán vượt tồn. Không bán sản phẩm ngừng kinh doanh. Mỗi sản phẩm xuất hiện tối đa 1 dòng trong đơn.
- **BR-S04** Giảm giá ở cấp đơn, kiểu `AMOUNT` (số tiền) hoặc `PERCENT`. `discount_amount ≤ subtotal`, và tỷ lệ giảm ≤ giới hạn của vai trò.
- **BR-S05** Phân bổ giảm giá vào từng dòng theo tỷ lệ thành tiền, làm tròn đến đồng. Phần dư do làm tròn dồn vào dòng có thành tiền lớn nhất, để tổng phân bổ luôn đúng bằng `discount_amount`.
- **BR-S06** Phương thức: `CASH`, `BANK_TRANSFER`, `CARD`. Chuyển khoản và thẻ **chỉ ghi nhận thủ công**, không kết nối ngân hàng. Tiền mặt: `tiền_khách_đưa ≥ total`, `tiền_thừa = tiền_khách_đưa − total`. MVP mỗi đơn dùng 1 phương thức.
- **BR-S07** Mã đơn duy nhất dạng `HD{yyyyMMdd}-{0001}`. Phiếu nhập dùng `PN…`, phiếu trả `TH…`, phiếu điều chỉnh `DC…`, khách hàng `KH000001`, nhà cung cấp `NCC0001`.
- **BR-S08** Mỗi request tạo đơn có `Idempotency-Key` (UUID). Gửi lại cùng key thì nhận lại đơn đã tạo, không tạo đơn mới.

### 7.4 Hủy đơn

- **BR-C01** Chỉ Admin/Manager. Chỉ đơn `COMPLETED`, chưa có phiếu trả, trong cùng ngày bán. Lý do bắt buộc.
- **BR-C02** Hoàn toàn bộ hàng về kho và hoàn toàn bộ tiền. Một đơn chỉ hủy được một lần.

### 7.5 Hoàn trả

- **BR-R01** Chỉ trả cho đơn `COMPLETED`, trong vòng **7 ngày** kể từ ngày bán (cấu hình được).
- **BR-R02** Với mỗi dòng: `SL trả ≤ SL bán − tổng SL đã trả trước đó`.
- **BR-R03** Tiền hoàn mỗi dòng = `round(line_total × SL_trả / SL_bán)`. Nếu lần trả này trả hết phần còn lại của dòng, tiền hoàn = `line_total − tiền đã hoàn trước đó` để không lệch do làm tròn.
- **BR-R04** Tình trạng hàng `RESELLABLE` thì cộng lại kho, `DAMAGED` thì không cộng.
- **BR-R05** Hoàn tiền bằng cùng phương thức của đơn gốc (MVP). Lý do trả bắt buộc.
- **BR-R06** Trả hết mọi dòng thì đơn có `return_status = FULL`. Giá trị này được **tính từ dữ liệu**, không lưu trùng.

### 7.6 Tồn kho

- **BR-I01** Tồn kho không âm, đảm bảo bằng ràng buộc `CHECK (quantity >= 0)` trong DB.
- **BR-I02** Mọi thay đổi tồn đều ghi 1 dòng `inventory_transactions` (loại, SL thay đổi, tồn sau, giá vốn, chứng từ gốc, người thực hiện, thời gian). Bảng lịch sử chỉ được thêm, không sửa, không xóa.
- **BR-I03** Sản phẩm sắp hết hàng khi đang kinh doanh và `quantity ≤ min_stock`.
- **BR-I04** Phiếu nhập đã xác nhận **không sửa và không hủy được** trong MVP. Sai sót được xử lý bằng phiếu điều chỉnh có lý do.

### 7.7 Định nghĩa số liệu báo cáo

| Chỉ số | Công thức | Thời điểm ghi nhận |
|---|---|---|
| Doanh thu gộp | Σ `total_amount` các đơn `COMPLETED` | Ngày bán |
| Tiền hoàn trả | Σ `total_refund` của phiếu trả (thuộc đơn `COMPLETED`) | Ngày trả |
| **Doanh thu thuần** | Doanh thu gộp − Tiền hoàn trả | |
| Giá vốn hàng bán (COGS) | Σ `quantity × unit_cost` dòng đơn `COMPLETED` − Σ `quantity × unit_cost` hàng trả **RESELLABLE** | Theo ngày bán / ngày trả |
| **Lợi nhuận gộp ước tính** | Doanh thu thuần − COGS | |
| Số đơn | Số đơn `COMPLETED` | Ngày bán |
| Giá trị tồn kho | Σ `quantity × avg_cost` sản phẩm đang có tồn | Thời điểm xem |

- Đơn `CANCELLED` bị loại hoàn toàn khỏi doanh thu và COGS. Vì chỉ hủy được trong ngày, báo cáo các ngày trước không bị thay đổi.
- Hàng trả bị hỏng không được trừ khỏi COGS: chi phí của nó vẫn nằm trong giá vốn, tức là được tính như một khoản tổn thất.
- "Ngày" được tính theo giờ Việt Nam: `(created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date`.

### 7.8 Tài khoản

- **BR-U01** Username duy nhất, 3–50 ký tự. Mật khẩu ≥ 8 ký tự, có cả chữ và số. Lưu bằng hash Argon2.
- **BR-U02** Đăng nhập sai 5 lần liên tiếp thì khóa tạm thời 15 phút. Ngoài ra có rate limit theo IP.
- **BR-U03** Tài khoản bị khóa (`is_active = false`) không đăng nhập được, và các refresh token hiện có bị thu hồi.
- **BR-U04** Admin không thể tự khóa hoặc tự hạ quyền chính mình. Hệ thống luôn còn ít nhất 1 Admin đang hoạt động.
- **BR-U05** Đổi mật khẩu phải nhập mật khẩu cũ. Sau khi đổi, thu hồi mọi phiên khác.

## 8. Lỗi và ngoại lệ

Mọi lỗi trả về cùng định dạng:

```json
{ "error": { "code": "OUT_OF_STOCK", "message": "Sản phẩm 'Sữa tươi 1L' chỉ còn 2", "details": { "product_id": 12, "available": 2 } } }
```

| Mã lỗi | HTTP | Tình huống |
|---|---|---|
| `VALIDATION_ERROR` | 422 | Dữ liệu sai định dạng; `details` liệt kê lỗi theo từng trường |
| `INVALID_CREDENTIALS` | 401 | Sai username/mật khẩu (không nói rõ sai cái nào) |
| `ACCOUNT_LOCKED` / `ACCOUNT_DISABLED` | 403 | Tài khoản bị khóa tạm thời hoặc bị vô hiệu hóa |
| `TOKEN_EXPIRED` / `UNAUTHORIZED` | 401 | Token hết hạn hoặc không hợp lệ |
| `FORBIDDEN` | 403 | Không đủ quyền |
| `NOT_FOUND` | 404 | Không tìm thấy bản ghi |
| `DUPLICATE_SKU`, `DUPLICATE_BARCODE`, `DUPLICATE_USERNAME`, `DUPLICATE_PHONE` | 409 | Trùng dữ liệu duy nhất |
| `PRODUCT_INACTIVE` | 409 | Bán/nhập sản phẩm ngừng kinh doanh |
| `OUT_OF_STOCK` | 409 | Không đủ tồn |
| `DISCOUNT_EXCEEDS_LIMIT` | 403 | Giảm giá vượt quyền |
| `INSUFFICIENT_PAYMENT` | 422 | Tiền khách đưa < tổng tiền |
| `INVALID_STATE` | 409 | Xác nhận phiếu không ở nháp, hủy đơn đã hủy, … |
| `CANCEL_NOT_ALLOWED` | 409 | Hủy đơn đã có trả hàng hoặc khác ngày |
| `RETURN_QUANTITY_EXCEEDED` | 409 | Trả vượt số lượng |
| `RETURN_PERIOD_EXPIRED` | 409 | Quá hạn đổi trả |
| `NEGATIVE_STOCK` | 409 | Điều chỉnh làm tồn âm |
| `IDEMPOTENCY_CONFLICT` | 409 | Dùng lại một Idempotency-Key với nội dung khác |
| `FILE_INVALID` | 422 | Ảnh sai định dạng (chỉ JPEG/PNG/WebP) hoặc > 2MB |
| `RATE_LIMITED` | 429 | Gọi quá nhiều lần (đăng nhập) |
| `INTERNAL_ERROR` | 500 | Lỗi hệ thống; không trả stack trace |

## 9. Phạm vi MVP và mở rộng

**MVP (làm trong dự án này):**
- Toàn bộ module ở mục 4.
- Xuất CSV.
- Ảnh sản phẩm lưu trên đĩa của server.
- In hóa đơn qua trang in của trình duyệt (khổ 80mm).
- Quét barcode bằng máy quét USB (hoạt động như bàn phím).

**Mở rộng (ghi vào README là chưa triển khai):**
- Xuất Excel
- Quên mật khẩu qua email
- Hủy phiếu nhập đã xác nhận
- Giảm giá theo dòng, chương trình khuyến mãi
- Tích điểm khách hàng
- Thanh toán kết hợp nhiều phương thức
- Bán theo đơn vị lẻ (kg, m)
- Lưu ảnh trên cloud
- Đa chi nhánh / đa kho. Thiết kế đã chừa chỗ: sau này chỉ cần thêm `warehouse_id` vào `inventory` và `inventory_transactions`.
- Tích hợp cổng thanh toán, hóa đơn điện tử
