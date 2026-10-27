import type { Ref, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

import { cn } from "@/utils/cn";

const fieldBase =
  "w-full rounded-md border border-border bg-card px-3 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none disabled:bg-surface-hover disabled:opacity-70";
const invalidClass = "border-destructive focus:border-destructive focus:ring-destructive/20";

export function Select({
  className,
  invalid,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean; ref?: Ref<HTMLSelectElement> }) {
  return (
    <select aria-invalid={invalid || undefined} className={cn(fieldBase, "h-9", invalid && invalidClass, className)} {...props} />
  );
}

export function Textarea({
  className,
  invalid,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean; ref?: Ref<HTMLTextAreaElement> }) {
  return (
    <textarea
      aria-invalid={invalid || undefined}
      className={cn(fieldBase, "min-h-20 py-2", invalid && invalidClass, className)}
      {...props}
    />
  );
}
