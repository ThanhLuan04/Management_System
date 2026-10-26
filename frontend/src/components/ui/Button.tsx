import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/utils/cn";

import { Spinner } from "./Spinner";

const variants = {
  default: "bg-primary text-primary-foreground hover:bg-primary-hover",
  secondary: "bg-slate-100 text-foreground hover:bg-slate-200",
  outline: "border border-border bg-card text-foreground hover:bg-slate-50",
  ghost: "text-foreground hover:bg-slate-100",
  destructive: "bg-destructive text-white hover:bg-red-700",
} as const;

const sizes = {
  sm: "h-8 px-3 text-sm",
  md: "h-9 px-4 text-sm",
  lg: "h-11 px-6 text-base",
  icon: "h-9 w-9",
} as const;

/** Class kiểu dáng của nút — dùng cho <Link> trông như nút (không lồng <button> trong <a>). */
export function buttonClass({
  variant = "default",
  size = "md",
  className,
}: { variant?: keyof typeof variants; size?: keyof typeof sizes; className?: string } = {}) {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap transition-colors",
    "focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none",
    variants[variant],
    sizes[size],
    className,
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  /** Đang xử lý: hiện spinner và khóa nút (chống bấm nhiều lần), giữ nguyên chiều rộng. */
  loading?: boolean;
}

export function Button({
  variant = "default",
  size = "md",
  loading = false,
  disabled,
  className,
  children,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "relative inline-flex items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap transition-colors",
        "focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {loading && (
        <span className="absolute inset-0 flex items-center justify-center">
          <Spinner className="h-4 w-4" />
        </span>
      )}
      <span className={cn("inline-flex items-center gap-2", loading && "invisible")}>{children}</span>
    </button>
  );
}
