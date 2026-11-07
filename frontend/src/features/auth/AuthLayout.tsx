import { Boxes, ChartColumn, PackageCheck, ScanBarcode } from "lucide-react";
import type { ReactNode } from "react";

const HIGHLIGHTS = [
  { icon: ScanBarcode, title: "Bán hàng nhanh tại quầy", text: "Quét mã vạch, giảm giá theo quyền, in hóa đơn 80mm." },
  { icon: PackageCheck, title: "Tồn kho luôn khớp", text: "Mọi thay đổi đều có chứng từ và lịch sử." },
  { icon: ChartColumn, title: "Biết lãi lỗ mỗi ngày", text: "Doanh thu, giá vốn, lợi nhuận theo giờ Việt Nam." },
];

/** Khung trang chưa đăng nhập (đăng nhập, quên mật khẩu): cột giới thiệu ở màn hình lớn + nội dung. */
export function AuthLayout({ title, description, children }: { title: string; description: ReactNode; children: ReactNode }) {
  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      {/* Cột giới thiệu (màn hình lớn): cùng tông với sidebar để vào ứng dụng không bị "nhảy" màu */}
      <aside className="relative hidden overflow-hidden bg-sidebar p-12 text-sidebar-foreground lg:flex lg:flex-col lg:justify-between">
        <div
          className="pointer-events-none absolute -top-32 -right-32 h-96 w-96 rounded-full bg-primary/30 blur-3xl"
          aria-hidden
        />
        <div className="relative flex items-center gap-2.5 text-sidebar-active-foreground">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <Boxes className="h-6 w-6" aria-hidden />
          </span>
          <span className="text-xl font-semibold tracking-tight">SmartStore</span>
        </div>
        <div className="relative max-w-md">
          <p className="text-3xl leading-tight font-semibold text-sidebar-active-foreground">
            Quản lý cửa hàng bán lẻ gọn trong một màn hình.
          </p>
          <ul className="mt-8 space-y-4">
            {HIGHLIGHTS.map(({ icon: Icon, title: itemTitle, text }) => (
              <li key={itemTitle} className="flex gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sidebar-active text-sidebar-accent">
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <span>
                  <span className="block font-medium text-sidebar-active-foreground">{itemTitle}</span>
                  <span className="text-sm">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-sidebar-muted">Bán hàng · Kho · Báo cáo · Phân quyền nhân viên</p>
      </aside>

      <main className="flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-6 lg:hidden">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <Boxes className="h-6 w-6" aria-hidden />
            </span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1 mb-6 text-sm text-muted">{description}</p>
          {children}
        </div>
      </main>
    </div>
  );
}

/** Hộp báo lỗi chung của form trên trang chưa đăng nhập. */
export function FormAlert({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="rounded-md border border-destructive/30 bg-destructive-soft px-3 py-2 text-sm text-destructive-strong">
      {children}
    </div>
  );
}
