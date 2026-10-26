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
      <div className="flex h-14 items-center gap-2 px-5 text-white">
        <Brand className="h-6 w-6 text-blue-400" aria-hidden />
        <span className="text-lg font-semibold">SmartStore</span>
      </div>
      <div className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {groups.map((group) => (
          <div key={group.label}>
            <p className="px-2 pb-1.5 text-xs font-medium tracking-wide text-slate-500 uppercase">{group.label}</p>
            <ul className="space-y-0.5">
              {group.items.map(({ to, label, icon: Icon }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-3 rounded-md px-2 py-2 text-sm transition-colors hover:bg-sidebar-active hover:text-white",
                        isActive && "bg-sidebar-active font-medium text-white",
                      )
                    }
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden />
                    {label}
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
