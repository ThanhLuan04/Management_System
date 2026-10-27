import { Badge } from "@/components/ui/Badge";

import type { PurchaseStatus } from "./api";

const LABELS: Record<PurchaseStatus, { label: string; variant: "warning" | "success" | "muted" }> = {
  DRAFT: { label: "Nháp", variant: "warning" },
  CONFIRMED: { label: "Đã nhập kho", variant: "success" },
  CANCELLED: { label: "Đã hủy", variant: "muted" },
};

export function PurchaseStatusBadge({ status }: { status: PurchaseStatus }) {
  const { label, variant } = LABELS[status];
  return <Badge variant={variant}>{label}</Badge>;
}

export const PURCHASE_STATUS_OPTIONS = Object.entries(LABELS).map(([value, { label }]) => ({ value, label }));
