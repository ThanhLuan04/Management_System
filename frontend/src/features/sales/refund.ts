import type { OrderItem, Payment, PaymentMethod } from "./api";

/**
 * Tiền hoàn dự kiến cho `quantity` sản phẩm của một dòng đơn — theo giá SAU giảm giá đã phân bổ.
 * Backend tính chính xác (lần trả cuối hoàn đúng phần còn lại); ở đây có thể lệch vài đồng do làm tròn.
 */
export function estimateRefund(item: Pick<OrderItem, "line_total" | "quantity">, quantity: number): number {
  if (quantity <= 0) return 0;
  return Math.floor((Number(item.line_total) * quantity) / item.quantity + 0.5);
}

/** Còn hoàn được theo từng phương thức = đã thu − đã hoàn (giống backend refundable_by_method), chỉ giữ khoản > 0. */
export function refundableByMethod(payments: Pick<Payment, "type" | "method" | "amount">[]): Partial<Record<PaymentMethod, number>> {
  const remaining: Partial<Record<PaymentMethod, number>> = {};
  for (const p of payments) {
    remaining[p.method] = (remaining[p.method] ?? 0) + (p.type === "PAYMENT" ? 1 : -1) * Number(p.amount);
  }
  return Object.fromEntries(Object.entries(remaining).filter(([, amount]) => amount > 0));
}

/** Phương thức hoàn mặc định như backend: tiền mặt nếu còn, không thì khoản còn nhiều nhất. */
export function defaultRefundMethod(remaining: Partial<Record<PaymentMethod, number>>): PaymentMethod | undefined {
  const methods = Object.keys(remaining) as PaymentMethod[];
  if (methods.includes("CASH")) return "CASH";
  return methods.sort((a, b) => (remaining[b] ?? 0) - (remaining[a] ?? 0))[0];
}