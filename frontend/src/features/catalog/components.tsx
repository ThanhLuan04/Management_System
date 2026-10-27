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

export function ProductThumb({ url, name, className }: { url: string | null; name: string; className?: string }) {
  return url ? (
    <img src={url} alt={name} loading="lazy" className={cn("h-10 w-10 rounded-md border border-border object-cover", className)} />
  ) : (
    <span
      className={cn("flex h-10 w-10 items-center justify-center rounded-md border border-dashed border-border text-slate-300", className)}
      aria-label="Chưa có ảnh"
    >
      <ImageOff className="h-4 w-4" aria-hidden />
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
