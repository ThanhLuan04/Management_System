import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Card } from "@/components/ui/Card";
import { cn } from "@/utils/cn";

const tones = {
  primary: "bg-primary-soft text-primary",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning-strong",
  info: "bg-info-soft text-info",
  destructive: "bg-destructive-soft text-destructive",
} as const;

/** Thẻ chỉ số (Tổng quan, Báo cáo): nhãn + icon màu theo ý nghĩa, giá trị lớn, dòng phụ. */
export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "primary",
  valueTone,
  compact,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: LucideIcon;
  tone?: keyof typeof tones;
  /** Tô màu chính con số khi cần chú ý (sắp hết hàng, lỗ) */
  valueTone?: "warning" | "negative";
  /** Nhiều thẻ trên một hàng (Báo cáo) → chữ nhỏ hơn */
  compact?: boolean;
}) {
  return (
    // role="group" + tên: trình đọc màn hình đọc nhãn cùng con số; test tìm thẻ theo tên
    <Card className="p-4" role="group" aria-label={label}>
      {/* Icon nằm trên nhãn (không cùng hàng) để nhãn dài không bị xuống dòng làm lệch con số giữa các thẻ */}
      {Icon && (
        <span className={cn("mb-3 flex h-9 w-9 items-center justify-center rounded-lg", tones[tone])}>
          <Icon className="h-[18px] w-[18px]" aria-hidden />
        </span>
      )}
      <p className="truncate text-sm text-muted" title={label}>
        {label}
      </p>
      <p
        className={cn(
          // Số lớn đứng một mình giữ chữ số tỉ lệ (không dùng .tabular) — index.css
          "font-bold tracking-tight",
          compact ? "mt-1 text-xl" : "mt-1.5 text-2xl",
          valueTone === "warning" && "text-warning-strong",
          valueTone === "negative" && "text-destructive-strong",
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </Card>
  );
}
