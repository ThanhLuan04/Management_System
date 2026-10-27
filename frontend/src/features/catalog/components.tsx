import { AlertTriangle, ImageOff, PackageX } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { cn } from "@/utils/cn";
import { formatNumber } from "@/utils/format";

import type { StockTransaction } from "./api";

export const TRANSACTION_LABELS: Record<StockTransaction["type"], string> = {
  PURCHASE: "Nhập hàng",
  SALE: "Bán hàng",
  SALE_RETURN: "Khách trả hàng",
  ORDER_CANCEL: "Hủy đơn",
  ADJUSTMENT: "Điều chỉnh kho",
};

// Sắc màu cho ô chữ cái khi sản phẩm chưa có ảnh; nền và chữ được trộn với màu thẻ/màu chữ nên hợp cả chế độ tối
const TILE_HUES = ["#2563eb", "#0d9488", "#7c3aed", "#d97706", "#e11d48", "#16a34a", "#4f46e5", "#0891b2"];

/** "Bia Heineken lon 330ml" → "BH": chữ cái đầu của hai từ đầu tiên có chữ. */
export function initials(name: string): string {
  const words = name.split(/\s+/).filter((w) => /\p{L}/u.test(w));
  return words
    .slice(0, 2)
    .map((w) => w.match(/\p{L}/u)![0])
    .join("")
    .toUpperCase();
}

/** Cùng một tên luôn ra cùng một màu (băm tên → chỉ số trong bảng màu). */
export function tileHue(name: string): string {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.codePointAt(0)!) | 0;
  return TILE_HUES[Math.abs(hash) % TILE_HUES.length];
}

export function ProductThumb({ url, name, className }: { url: string | null; name: string; className?: string }) {
  if (url) {
    return <img src={url} alt={name} loading="lazy" className={cn("h-10 w-10 rounded-lg border border-border object-cover", className)} />;
  }
  const text = initials(name);
  const hue = tileHue(name);
  return (
    <span
      className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm font-semibold select-none", className)}
      // Màu đặt bằng style (không qua class) để tailwind-merge không nhầm với cỡ chữ khi gộp className
      style={{
        backgroundColor: `color-mix(in oklab, ${hue} 14%, var(--card))`,
        color: `color-mix(in oklab, ${hue} 80%, var(--foreground))`,
      }}
      role="img"
      aria-label={`${name} (chưa có ảnh)`}
    >
      {text || <ImageOff className="h-4 w-4" aria-hidden />}
    </span>
  );
}

/** Tồn kho kèm cảnh báo: hết hàng (đỏ) / sắp hết (vàng) luôn có icon + chữ, không chỉ dựa vào màu. */
export function StockCell({ quantity, isLow }: { quantity: number; isLow: boolean }) {
  if (quantity === 0) {
    return (
      <Badge variant="destructive" icon={<PackageX className="h-3.5 w-3.5" aria-hidden />}>
        Hết hàng
      </Badge>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="tabular">{formatNumber(quantity)}</span>
      {isLow && (
        <Badge variant="warning" icon={<AlertTriangle className="h-3.5 w-3.5" aria-hidden />}>
          Sắp hết
        </Badge>
      )}
    </span>
  );
}

export function ActiveBadge({ active, activeLabel = "Đang bán", inactiveLabel = "Ngừng kinh doanh" }: {
  active: boolean;
  activeLabel?: string;
  inactiveLabel?: string;
}) {
  return active ? <Badge variant="success">{activeLabel}</Badge> : <Badge variant="muted">{inactiveLabel}</Badge>;
}
