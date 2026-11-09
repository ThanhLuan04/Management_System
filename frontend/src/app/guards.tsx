import { ShieldX } from "lucide-react";
import type { ReactNode } from "react";
import { Navigate } from "react-router";

import { Spinner } from "@/components/ui/Spinner";
import { useAuth } from "@/features/auth/AuthProvider";
import type { Permission } from "@/features/auth/permissions";
import type { Me } from "@/types/api";

/** Chưa đăng nhập → chuyển về /login; đăng nhập xong vào trang chủ theo vai trò (homePath). */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="h-8 w-8 text-primary" label="Đang khôi phục phiên đăng nhập" />
      </div>
    );
  }
  if (status === "anonymous") {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

/** Ẩn trang khi thiếu quyền (backend vẫn chặn API — đây chỉ là trải nghiệm giao diện). */
export function RequirePermission({ permission, children }: { permission: Permission; children: ReactNode }) {
  const { can } = useAuth();
  if (!can(permission)) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-20 text-center">
        <ShieldX className="h-12 w-12 text-subtle" aria-hidden />
        <h1 className="text-lg font-semibold">Bạn không có quyền truy cập trang này</h1>
        <p className="text-sm text-muted">Liên hệ quản trị viên nếu bạn cần quyền này.</p>
      </div>
    );
  }
  return <>{children}</>;
}

/** Trang chủ theo vai trò: Thu ngân → Bán hàng, Nhân viên bếp → Chấm công, Admin / Quản lý → Tổng quan. */
export function homePath(user: Pick<Me, "role">): string {
  if (user.role.code === "CASHIER") return "/pos";
  if (user.role.code === "KITCHEN") return "/kitchen";
  return "/dashboard";
}

export function HomeRedirect() {
  const { user } = useAuth();
  return <Navigate to={user ? homePath(user) : "/login"} replace />;
}
