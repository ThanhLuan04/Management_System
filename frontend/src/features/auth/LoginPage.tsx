import { zodResolver } from "@hookform/resolvers/zod";
import { Boxes, ChartColumn, PackageCheck, ScanBarcode } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Navigate, useLocation, useNavigate, type Location } from "react-router";
import { z } from "zod";

import { Button } from "@/components/ui/Button";
import { FormField, Input } from "@/components/ui/Input";
import { toApiError } from "@/services/apiError";
import { formatDateTime } from "@/utils/format";

import { useAuth } from "./AuthProvider";

const schema = z.object({
  username: z.string().trim().min(3, "Tên đăng nhập tối thiểu 3 ký tự").max(50, "Tối đa 50 ký tự"),
  password: z.string().min(1, "Vui lòng nhập mật khẩu").max(128, "Tối đa 128 ký tự"),
});

type FormValues = z.infer<typeof schema>;

const HIGHLIGHTS = [
  { icon: ScanBarcode, title: "Bán hàng nhanh tại quầy", text: "Quét mã vạch, giảm giá theo quyền, in hóa đơn 80mm." },
  { icon: PackageCheck, title: "Tồn kho luôn khớp", text: "Mọi thay đổi đều có chứng từ và lịch sử." },
  { icon: ChartColumn, title: "Biết lãi lỗ mỗi ngày", text: "Doanh thu, giá vốn, lợi nhuận theo giờ Việt Nam." },
];

export function LoginPage() {
  const { status, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { username: "", password: "" } });

  const from = (location.state as { from?: Location } | null)?.from?.pathname ?? "/";
  if (status === "authenticated") return <Navigate to={from} replace />;

  const onSubmit = async (values: FormValues) => {
    setFormError(null);
    try {
      await login(values.username, values.password);
      navigate(from, { replace: true });
    } catch (error) {
      const apiError = toApiError(error);
      const lockedUntil = (apiError.details as { locked_until?: string } | undefined)?.locked_until;
      setFormError(
        apiError.code === "ACCOUNT_LOCKED" && lockedUntil
          ? `${apiError.message}. Thử lại sau ${formatDateTime(lockedUntil)}.`
          : apiError.message,
      );
    }
  };

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
            {HIGHLIGHTS.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sidebar-active text-sidebar-accent">
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <span>
                  <span className="block font-medium text-sidebar-active-foreground">{title}</span>
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
          <h1 className="text-2xl font-semibold tracking-tight">Đăng nhập SmartStore</h1>
          <p className="mt-1 mb-6 text-sm text-muted">Dùng tài khoản được quản trị viên cấp.</p>

          <form
            onSubmit={handleSubmit(onSubmit)}
            noValidate
            className="space-y-4 rounded-xl border border-border bg-card p-6 shadow-card"
          >
            {formError && (
              <div role="alert" className="rounded-md border border-destructive/30 bg-destructive-soft px-3 py-2 text-sm text-destructive-strong">
                {formError}
              </div>
            )}
            <FormField label="Tên đăng nhập" htmlFor="username" required error={errors.username?.message}>
              <Input
                id="username"
                autoComplete="username"
                autoFocus
                invalid={!!errors.username}
                aria-describedby={errors.username ? "username-error" : undefined}
                {...register("username")}
              />
            </FormField>
            <FormField label="Mật khẩu" htmlFor="password" required error={errors.password?.message}>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                invalid={!!errors.password}
                aria-describedby={errors.password ? "password-error" : undefined}
                {...register("password")}
              />
            </FormField>
            <Button type="submit" className="w-full" size="lg" loading={isSubmitting}>
              Đăng nhập
            </Button>
          </form>
        </div>
      </main>
    </div>
  );
}
