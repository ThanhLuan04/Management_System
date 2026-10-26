import { Badge } from "@/components/ui/Badge";

import type { OrderSummary } from "../dashboard/api";

/** Trạng thái đơn hiển thị dễ hiểu — docs/05 §5. */
export function OrderStatusBadge({ order }: { order: Pick<OrderSummary, "status" | "return_status"> }) {
  if (order.status === "CANCELLED") return <Badge variant="destructive">Đã hủy</Badge>;
  if (order.return_status === "FULL") return <Badge variant="muted">Đã trả toàn bộ</Badge>;
  if (order.return_status === "PARTIAL") return <Badge variant="info">Trả một phần</Badge>;
  return <Badge variant="success">Hoàn thành</Badge>;
}

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: "Tiền mặt",
  BANK_TRANSFER: "Chuyển khoản",
  CARD: "Thẻ",
};
