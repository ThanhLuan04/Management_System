import { ShieldX } from "lucide-react";
import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";

import { Spinner } from "@/components/ui/Spinner";
import { useAuth } from "@/features/auth/AuthProvider";
import { P, type Permission } from "@/features/auth/permissions";

/** Chưa đăng nhập → chuyển về /login, nhớ trang đang mở để quay lại sau khi đăng nhập. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="h-8 w-8 text-primary" label="Đang khôi phục phiên đăng nhập" />
      </div>
    );
  }
  if (status === "anonymous") {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return <>{children}</>;
}

/** Ẩn trang khi thiếu quyền (backend vẫn chặn API — đây chỉ là trải nghiệm giao diện). */
export function RequirePermission({ permission, children }: { permission: Permission; children: ReactNode }) {
  const { can } = useAuth();
  if (!can(permission)) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-20 text-center">
        <ShieldX className="h-12 w-12 text-slate-300" aria-hidden />
        <h1 className="text-lg font-semibold">Bạn không có quyền truy cập trang này</h1>
        <p className="text-sm text-muted">Liên hệ quản trị viên nếu bạn cần quyền này.</p>
      </div>
    );
  }
  return <>{children}</>;
}

/** Trang chủ theo vai trò: quản lý vào Tổng quan, thu ngân vào màn hình bán hàng. */
export function HomeRedirect() {
  const { can } = useAuth();
  if (can(P.REPORTS_VIEW)) return <Navigate to="/dashboard" replace />;
  if (can(P.ORDERS_CREATE)) return <Navigate to="/pos" replace />;
  return <Navigate to="/profile" replace />;
}
