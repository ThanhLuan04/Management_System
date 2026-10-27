import type { OrderItem } from "./api";

/**
 * Tiền hoàn dự kiến cho `quantity` sản phẩm của một dòng đơn — theo giá SAU giảm giá đã phân bổ.
 * Backend tính chính xác (lần trả cuối hoàn đúng phần còn lại); ở đây có thể lệch vài đồng do làm tròn.
 */
export function estimateRefund(item: Pick<OrderItem, "line_total" | "quantity">, quantity: number): number {
  if (quantity <= 0) return 0;
  return Math.floor((Number(item.line_total) * quantity) / item.quantity + 0.5);
}
