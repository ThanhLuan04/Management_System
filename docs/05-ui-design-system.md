# 05 – Design system và wireframe

Nền tảng: Tailwind CSS + shadcn/ui (Radix). Icon: lucide-react. Toast: sonner.

## 1. Màu sắc

Màu được khai báo bằng CSS variable, theo cách của shadcn, để sau này đổi theme không phải sửa component.

| Token | Dùng cho | Giá trị (light) |
|---|---|---|
| `--primary` | Nút chính, link, mục sidebar đang chọn | Blue 600 `#2563EB` |
| `--primary-foreground` | Chữ trên nền primary | `#FFFFFF` |
| `--background` | Nền trang | Slate 50 `#F8FAFC` |
| `--card` | Nền thẻ, bảng, form | `#FFFFFF` |
| `--foreground` | Chữ chính | Slate 900 `#0F172A` |
| `--muted-foreground` | Chữ phụ, nhãn | Slate 500 `#64748B` |
| `--border` | Viền | Slate 200 `#E2E8F0` |
| `--success` | Hoàn thành, nhập thành công | Green 600 `#16A34A` |
| `--warning` | Sắp hết hàng, nháp | Amber 500 `#F59E0B` |
| `--destructive` | Lỗi, hủy, hết hàng | Red 600 `#DC2626` |
| `--info` | Trả một phần, thông tin | Sky 600 `#0284C7` |
| Sidebar | Nền sidebar | Slate 900 `#0F172A`, chữ Slate 300 |

Chế độ tối không thuộc MVP, nhưng hệ thống token đã sẵn sàng cho việc bổ sung.

## 2. Typography

- Font: **Be Vietnam Pro** (Google Fonts), hiển thị dấu tiếng Việt rõ ràng. Font dự phòng: `system-ui, sans-serif`.
- Cột tiền dùng `font-variant-numeric: tabular-nums` để các chữ số thẳng hàng.

| Cấp | Kích thước / độ đậm | Dùng cho |
|---|---|---|
| H1 | 24px / 600 | Tiêu đề trang |
| H2 | 18px / 600 | Tiêu đề thẻ, section |
| Body | 14px / 400 | Nội dung, bảng |
| Small | 12px / 500 | Nhãn, badge, chú thích |
| KPI | 28px / 700 | Số liệu dashboard |

## 3. Spacing, bo góc, đổ bóng

- Thang spacing 4px (Tailwind mặc định): khoảng cách trong thẻ 16–24px, giữa các section 24px.
- Bo góc: input/nút 6px, thẻ/modal 8px.
- Đổ bóng: thẻ dùng `shadow-sm`, modal dùng `shadow-lg`.
- Breakpoint:
  - `< 768px`: sidebar thu thành drawer, bảng cuộn ngang.
  - `768–1279px`: sidebar dạng icon.
  - `≥ 1280px`: sidebar đầy đủ.

## 4. Component

| Component | Biến thể / quy tắc |
|---|---|
| **Button** | `default` (primary), `secondary`, `outline`, `ghost`, `destructive`; size `sm`/`md`/`lg`. Khi đang xử lý thì hiện spinner, bị **disable** và giữ nguyên chiều rộng. |
| **Input / Select / Textarea** | Nhãn đặt phía trên, trường bắt buộc có dấu `*`. Lỗi hiển thị bằng chữ đỏ 12px ngay dưới trường và viền đỏ. Ô tiền tự định dạng `1.250.000` khi nhập. |
| **DataTable** | Header có thể bấm để sắp xếp. Dòng cao 44px. Cột số căn phải. Phân trang ở cuối bảng: "Hiển thị 1–20 / 134", chọn page size. Có thanh bộ lọc phía trên. |
| **Badge trạng thái** | Xem bảng ở mục 5. |
| **Dialog / ConfirmDialog** | Dùng cho thao tác quan trọng: xác nhận nhập kho, hủy đơn, khóa tài khoản. Nội dung nêu rõ hậu quả, ví dụ "Tồn kho sẽ được cộng thêm 44 sản phẩm. Phiếu không thể sửa sau khi xác nhận." Thao tác phá hủy dùng nút `destructive`. |
| **Toast** | Thành công: xanh, tự tắt sau 3 giây. Lỗi: đỏ, hiện `error.message` từ API, tự tắt sau 6 giây. |
| **Trạng thái trang** | Loading: skeleton theo hình dạng bảng/thẻ. Empty: icon, câu mô tả và nút hành động ("Chưa có sản phẩm" + "Thêm sản phẩm"). Error: thông báo, nút "Thử lại" và mã request_id. |
| **MoneyText** | `Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' })` → `1.250.000 ₫` |
| **Ngày giờ** | `dd/MM/yyyy HH:mm`, múi giờ `Asia/Ho_Chi_Minh` |

## 5. Trạng thái hiển thị

| Giá trị | Nhãn | Màu |
|---|---|---|
| Phiếu nhập `DRAFT` | Nháp | warning |
| Phiếu nhập `CONFIRMED` | Đã nhập kho | success |
| Phiếu nhập `CANCELLED` | Đã hủy | gray |
| Đơn `COMPLETED` | Hoàn thành | success |
| Đơn `CANCELLED` | Đã hủy | destructive |
| return_status `PARTIAL` | Trả một phần | info |
| return_status `FULL` | Đã trả toàn bộ | gray |
| Tồn `≤ min_stock` | Sắp hết | warning |
| Tồn `= 0` | Hết hàng | destructive |
| Sản phẩm/tài khoản `is_active=false` | Ngừng kinh doanh / Đã khóa | gray |
| Thanh toán | Tiền mặt / Chuyển khoản / Thẻ | outline |

## 6. Wireframe

### 6.1 Layout chung

```
┌────────────┬──────────────────────────────────────────────────────────┐
│ ▣ SmartStore│  Sản phẩm / Chỉnh sửa                  🔔  Nguyễn Văn A ▾│
│            ├──────────────────────────────────────────────────────────┤
│ ▤ Tổng quan │                                                          │
│ 🛒 Bán hàng  │   [Tiêu đề trang]                       [Nút hành động]   │
│ 🧾 Đơn hàng  │                                                          │
│ ↩ Trả hàng  │   ┌──────────────────────────────────────────────────┐   │
│ 📦 Sản phẩm  │   │                Nội dung chính                    │   │
│ 🗂 Danh mục  │   └──────────────────────────────────────────────────┘   │
│ 🚚 Nhập hàng │                                                          │
│ 🏭 Kho      │                                                          │
│ 🤝 NCC      │                                                          │
│ 👥 Khách hàng│                                                         │
│ 📊 Báo cáo  │                                                          │
│ ⚙ Hệ thống │  (Menu chỉ hiện mục người dùng có quyền)                  │
└────────────┴──────────────────────────────────────────────────────────┘
```

### 6.2 Dashboard

```
Tổng quan                            [01/10/2026 – 25/10/2026 ▾] [Ngày|Tuần|Tháng]
┌──────────────┬──────────────┬──────────────┬──────────────┬──────────────┐
│Doanh thu hôm │ Đơn hôm nay  │ DT thuần kỳ  │ LN gộp ước   │ Giá trị tồn  │
│nay 2.150.000₫│     18       │ 47.930.000₫  │ 9.120.000₫   │ 85.400.000₫  │
└──────────────┴──────────────┴──────────────┴──────────────┴──────────────┘
┌─────────────────────────────────────────────┬──────────────────────────┐
│ Doanh thu & lợi nhuận (Recharts, cột+đường) │ Top 5 sản phẩm bán chạy  │
│  ▂▃▅▆▃▂▇▅                                   │ 1. Sữa tươi TH 1L   140  │
└─────────────────────────────────────────────┴──────────────────────────┘
┌─────────────────────────────────────────────┬──────────────────────────┐
│ Đơn hàng gần đây (mã, khách, tiền, TT)      │ ⚠ Sắp hết hàng (7)      │
└─────────────────────────────────────────────┴──────────────────────────┘
```

### 6.3 Danh sách sản phẩm

```
Sản phẩm                                               [+ Thêm sản phẩm]
[🔍 Tên, SKU, barcode...] [Danh mục ▾] [Trạng thái ▾] [□ Sắp hết]
┌────┬──────────┬─────────────────────┬──────────┬──────────┬──────┬────────────┬───┐
│Ảnh │ SKU ↕    │ Tên sản phẩm ↕      │ Danh mục │ Giá bán ↕│ Tồn ↕│ Trạng thái │ ⋯ │
├────┼──────────┼─────────────────────┼──────────┼──────────┼──────┼────────────┼───┤
│ ▢  │SUA-TH-1L │Sữa tươi TH 1L       │ Sữa      │ 32.000 ₫ │  25  │ Đang bán   │ ⋯ │
│ ▢  │NUOC-500  │Nước suối 500ml      │ Đồ uống  │  5.000 ₫ │  3 ⚠ │ Đang bán   │ ⋯ │
└────┴──────────┴─────────────────────┴──────────┴──────────┴──────┴────────────┴───┘
Hiển thị 1–20 / 236                                    [‹] 1 2 3 … 12 [›]  [20 ▾]
```

### 6.4 Màn hình bán hàng (POS) – ưu tiên thao tác bằng bàn phím

```
┌───────────────────────────────────────────────┬───────────────────────────────┐
│ [🔍 Quét mã / tìm tên, SKU... (F2)        ]   │ Khách hàng: [SĐT/tên... ▾] [+]│
│ ┌───────────────────────────────────────┐     │  ○ Khách lẻ                   │
│ │ Kết quả: Sữa tươi TH 1L · 32.000₫ · 25│     ├───────────────────────────────┤
│ └───────────────────────────────────────┘     │ Tạm tính          180.000 ₫   │
│ Giỏ hàng (2)                                  │ Giảm giá [10][%|₫] −18.000 ₫  │
│ ┌──────────────────────┬─────────┬─────────┐  │ ───────────────────────────── │
│ │ Sữa tươi TH 1L       │ [−] 5 [+]│160.000₫ │✕│ │ KHÁCH CẦN TRẢ     162.000 ₫   │
│ │ 32.000₫ · còn 25     │          │         │ │ │ [Tiền mặt][Chuyển khoản][Thẻ] │
│ │ Bánh quy Cosy        │ [−] 2 [+]│ 20.000₫ │✕│ │ Khách đưa   [   200.000 ]     │
│ └──────────────────────┴─────────┴─────────┘  │ Gợi ý: [162k][170k][200k][500k]│
│                                               │ Tiền thừa          38.000 ₫   │
│                                               │ [   THANH TOÁN (F9)          ]│
└───────────────────────────────────────────────┴───────────────────────────────┘
```

Tổng tiền trên POS chỉ để **xem trước**. Sau khi thanh toán, hóa đơn hiển thị đúng số liệu do backend trả về.

### 6.5 Chi tiết đơn hàng và hoàn trả

```
Đơn hàng / HD20261025-0007   [Hoàn thành]           [🖨 In] [↩ Trả hàng] [Hủy đơn]
Khách: Trần Thị B · 0901234567   Thu ngân: Lê Văn C   25/10/2026 10:12
┌──────────────────────┬────┬──────────┬───────────┬──────────┬──────────┐
│ Sản phẩm             │ SL │ Đơn giá  │ Giảm (PB) │ Thành tiền│ Đã trả   │
└──────────────────────┴────┴──────────┴───────────┴──────────┴──────────┘
Thanh toán: Tiền mặt 162.000 ₫ (khách đưa 200.000, thối 38.000)
Lịch sử trả hàng: TH20261025-0002 · 2 sản phẩm · −57.600 ₫

[Modal Trả hàng]
  Sản phẩm          Còn trả được   SL trả   Tình trạng
  Sữa tươi TH 1L          5         [ 2 ]   (●) Còn bán được ( ) Hỏng
  Lý do *  [______________________]
  Tiền hoàn dự kiến: 57.600 ₫                    [Hủy] [Xác nhận trả hàng]
```

### 6.6 Phiếu nhập

```
Nhập hàng / Tạo phiếu nhập
Nhà cung cấp * [Chọn NCC ▾]           Ghi chú [_____________]
[🔍 Thêm sản phẩm...]
┌──────────────────┬──────┬───────────┬───────────┬────────────┬───┐
│ Sản phẩm         │ SL   │ Giá nhập  │ Chiết khấu│ Thành tiền │ ✕ │
└──────────────────┴──────┴───────────┴───────────┴────────────┴───┘
                                       Tổng giá trị phiếu: 298.000 ₫
                        [Lưu nháp]  [Xác nhận nhập kho] (mở ConfirmDialog)
```

Các trang còn lại (danh mục, nhà cung cấp, khách hàng, người dùng, tồn kho, lịch sử kho, báo cáo, hồ sơ) dùng chung mẫu **"danh sách + bộ lọc + DataTable + Dialog/Trang form"**, theo đúng quy tắc ở mục 4.
