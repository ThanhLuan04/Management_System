import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronDown, ChevronRight, LogOut, Menu, UserRound, X } from "lucide-react";
import { useState } from "react";
import { Link, Outlet, useMatches, useNavigate, useNavigation } from "react-router";
import { toast } from "sonner";

import { useAuth } from "@/features/auth/AuthProvider";

import { Sidebar } from "./Sidebar";

export interface RouteHandle {
  crumb?: string;
}

function Breadcrumb() {
  const crumbs = useMatches()
    .map((match) => (match.handle as RouteHandle | undefined)?.crumb && { label: (match.handle as RouteHandle).crumb!, path: match.pathname })
    .filter(Boolean) as { label: string; path: string }[];

  return (
    <nav aria-label="Đường dẫn" className="flex min-w-0 items-center gap-1 text-sm text-muted">
      <Link to="/" className="hover:text-foreground">
        SmartStore
      </Link>
      {crumbs.map((crumb, index) => (
        <span key={crumb.path} className="flex min-w-0 items-center gap-1">
          <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />
          {index === crumbs.length - 1 ? (
            <span aria-current="page" className="truncate font-medium text-foreground">
              {crumb.label}
            </span>
          ) : (
            <Link to={crumb.path} className="truncate hover:text-foreground">
              {crumb.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  if (!user) return null;

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      toast.success("Đã đăng xuất");
      navigate("/login", { replace: true });
    }
  };

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary">
          {user.full_name.charAt(0).toUpperCase()}
        </span>
        <span className="hidden text-left sm:block">
          <span className="block leading-tight font-medium">{user.full_name}</span>
          <span className="block text-xs leading-tight text-muted">{user.role.name}</span>
        </span>
        <ChevronDown className="h-4 w-4 text-muted" aria-hidden />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-50 min-w-48 rounded-md border border-border bg-card p-1 text-sm shadow-lg"
        >
          <DropdownMenu.Item
            onSelect={() => navigate("/profile")}
            className="flex cursor-pointer items-center gap-2 rounded px-2 py-2 outline-none data-[highlighted]:bg-surface-muted"
          >
            <UserRound className="h-4 w-4" aria-hidden /> Hồ sơ cá nhân
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          <DropdownMenu.Item
            onSelect={handleLogout}
            className="flex cursor-pointer items-center gap-2 rounded px-2 py-2 text-destructive outline-none data-[highlighted]:bg-destructive-soft"
          >
            <LogOut className="h-4 w-4" aria-hidden /> Đăng xuất
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/** Bố cục chung: sidebar trái (thu thành drawer trên điện thoại), header có breadcrumb + tài khoản. */
export function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  // Trang được tải theo nhu cầu: báo đang tải trong lúc trang cũ vẫn hiển thị
  const loading = useNavigation().state === "loading";

  return (
    <div className="min-h-screen lg:pl-60">
      {loading && (
        <div role="progressbar" aria-label="Đang tải trang" className="fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden bg-primary/20">
          <div className="h-full w-1/3 animate-[page-loading_1s_ease-in-out_infinite] bg-primary" />
        </div>
      )}
      <aside className="fixed inset-y-0 left-0 hidden w-60 lg:block">
        <Sidebar />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-overlay" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-64">
            <Sidebar onNavigate={() => setMobileOpen(false)} />
            <button
              className="absolute top-3 -right-11 rounded-md bg-card p-2"
              onClick={() => setMobileOpen(false)}
              aria-label="Đóng menu"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-card/95 px-4 backdrop-blur sm:px-6">
        <button
          className="rounded-md p-2 hover:bg-surface-muted lg:hidden"
          onClick={() => setMobileOpen(true)}
          aria-label="Mở menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <Breadcrumb />
        </div>
        <UserMenu />
      </header>

      <main className="px-4 py-6 sm:px-6">
        <Outlet />
      </main>
    </div>
  );
}
