import type { InputHTMLAttributes, ReactNode, Ref } from "react";

import { cn } from "@/utils/cn";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
  ref?: Ref<HTMLInputElement>;
}

export function Input({ className, invalid, ...props }: InputProps) {
  return (
    <input
      aria-invalid={invalid || undefined}
      className={cn(
        "h-9 w-full rounded-md border border-border bg-card px-3 text-sm placeholder:text-subtle",
        "focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none disabled:bg-surface-hover disabled:opacity-70",
        invalid && "border-destructive focus:border-destructive focus:ring-destructive/20",
        className,
      )}
      {...props}
    />
  );
}

interface FormFieldProps {
  label: string;
  htmlFor: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: ReactNode;
}

/** Nhãn phía trên, dấu * cho trường bắt buộc, lỗi đỏ ngay dưới ô — docs/05 §4. */
export function FormField({ label, htmlFor, required, error, hint, children }: FormFieldProps) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : (
        hint && <p className="text-xs text-muted">{hint}</p>
      )}
    </div>
  );
}
