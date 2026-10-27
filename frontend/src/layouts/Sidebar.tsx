import { NavLink } from "react-router";

import { BRAND_ICON, NAV_GROUPS } from "@/app/navigation";
import { useAuth } from "@/features/auth/AuthProvider";
import { cn } from "@/utils/cn";

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { can } = useAuth();
  const groups = NAV_GROUPS.map((group) => ({ ...group, items: group.items.filter((i) => can(i.permission)) })).filter(
    (group) => group.items.length > 0,
  );
  const Brand = BRAND_ICON;

  return (
    <nav aria-label="Menu chính" className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex h-14 items-center gap-2.5 border-b border-white/5 px-5 text-sidebar-active-foreground">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
          <Brand className="h-5 w-5" aria-hidden />
        </span>
        <span className="text-lg font-semibold tracking-tight">SmartStore</span>
      </div>
      <div className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {groups.map((group) => (
          <div key={group.label}>
            <p className="px-3 pb-1.5 text-[11px] font-semibold tracking-wider text-sidebar-muted uppercase">{group.label}</p>
            <ul className="space-y-0.5">
              {group.items.map(({ to, label, icon: Icon }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      cn(
                        "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                        "hover:bg-sidebar-active hover:text-sidebar-active-foreground",
                        isActive && "bg-sidebar-active font-medium text-sidebar-active-foreground",
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {/* Vạch đánh dấu mục đang mở — không chỉ dựa vào màu nền */}
                        {isActive && <span className="absolute inset-y-1.5 left-0 w-1 rounded-r-full bg-sidebar-accent" aria-hidden />}
                        <Icon className={cn("h-4 w-4 shrink-0", isActive ? "text-sidebar-accent" : "opacity-80 group-hover:opacity-100")} aria-hidden />
                        {label}
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}
