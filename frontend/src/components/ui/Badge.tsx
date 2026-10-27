import type { ReactNode } from "react";

import { cn } from "@/utils/cn";

const variants = {
  default: "bg-primary-soft text-primary-strong ring-primary/20",
  success: "bg-success-soft text-success-strong ring-success/25",
  warning: "bg-warning-soft text-warning-strong ring-warning/30",
  destructive: "bg-destructive-soft text-destructive-strong ring-destructive/20",
  info: "bg-info-soft text-info-strong ring-info/20",
  muted: "bg-surface-muted text-muted ring-border",
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
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset",
        variants[variant],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}
