import type { ReactNode } from "react";

import { cn } from "@/utils/cn";

const variants = {
  default: "bg-blue-50 text-blue-700 ring-blue-600/20",
  success: "bg-green-50 text-green-700 ring-green-600/20",
  warning: "bg-amber-50 text-amber-800 ring-amber-600/30",
  destructive: "bg-red-50 text-red-700 ring-red-600/20",
  info: "bg-sky-50 text-sky-700 ring-sky-600/20",
  muted: "bg-slate-100 text-slate-600 ring-slate-500/20",
  outline: "bg-card text-foreground ring-border",
} as const;

export type BadgeVariant = keyof typeof variants;

export function Badge({
  variant = "default",
  icon,
  children,
  className,
}: {
  variant?: BadgeVariant;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset",
        variants[variant],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}
