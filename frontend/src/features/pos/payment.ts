import type { OrderPayload, PaymentMethod, SplitPayment } from "@/features/sales/api";
import { formatMoney, toNumber } from "@/utils/format";

/** Cách trả tiền chọn ở màn hình bán hàng; MIXED = kết hợp nhiều phương thức. */
export type PayMode = PaymentMethod | "MIXED";

export const SPLIT_METHODS: PaymentMethod[] = ["CASH", "BANK_TRANSFER", "CARD"];

export interface PaymentState {
  mode: PayMode;
  /** Tiền mặt khách đưa (chế độ CASH) */
  cash: string;
  /** Mã giao dịch thẻ / ghi chú chuyển khoản nhập tay */
  reference: string;
  /** Số tiền từng phần (chế độ MIXED) */
  split: Record<PaymentMethod, string>;
  /** Thu ngân đã xác nhận tiền chuyển khoản về tài khoản */
  transferConfirmed: boolean;
}

export interface PaymentErrors {
  cash?: string;
  split?: string;
  transfer?: string;
}

export type PaymentResult =
  | { ok: true; payload: Pick<OrderPayload, "payment" | "payments"> }
  | { ok: false; errors: PaymentErrors };

export function emptySplit(): Record<PaymentMethod, string> {
  return { CASH: "", BANK_TRANSFER: "", CARD: "" };
}

export function splitTotal(split: Record<PaymentMethod, string>): number {
  return SPLIT_METHODS.reduce((sum, m) => sum + toNumber(split[m] || 0), 0);
}

/**
 * Kiểm tra và tạo phần thanh toán của đơn.
 * transferRef: mã đối soát in trên QR (null = chưa cấu hình tài khoản nhận, không có QR → không cần xác nhận).
 */
export function buildPayment(state: PaymentState, total: number, transferRef: string | null): PaymentResult {
  const qr = transferRef !== null;
  const needsConfirm = (amount: number) => qr && amount > 0 && !state.transferConfirmed;
  const confirmMessage = "Hãy xác nhận đã nhận tiền chuyển khoản trước khi thanh toán";
  const note = state.reference.trim() || null;

  switch (state.mode) {
    case "CASH": {
      if (state.cash === "") return { ok: false, errors: { cash: "Nhập số tiền khách đưa" } };
      if (toNumber(state.cash) < total) return { ok: false, errors: { cash: "Tiền khách đưa chưa đủ" } };
      return { ok: true, payload: { payment: { method: "CASH", cash_received: state.cash } } };
    }
    case "BANK_TRANSFER":
      if (needsConfirm(total)) return { ok: false, errors: { transfer: confirmMessage } };
      return { ok: true, payload: { payment: { method: "BANK_TRANSFER", reference_note: note ?? transferRef } } };
    case "CARD":
      return { ok: true, payload: { payment: { method: "CARD", reference_note: note } } };
    case "MIXED": {
      const parts = SPLIT_METHODS.map((method) => ({ method, amount: toNumber(state.split[method] || 0) })).filter(
        (p) => p.amount > 0,
      );
      const paid = parts.reduce((sum, p) => sum + p.amount, 0);
      if (paid !== total) {
        const diff = total - paid;
        return {
          ok: false,
          errors: { split: diff > 0 ? `Còn thiếu ${formatMoney(diff)}` : `Chia thừa ${formatMoney(-diff)} so với số tiền cần trả` },
        };
      }
      const transferAmount = toNumber(state.split.BANK_TRANSFER || 0);
      if (needsConfirm(transferAmount)) return { ok: false, errors: { transfer: confirmMessage } };

      const toSplit = ({ method, amount }: { method: PaymentMethod; amount: number }): SplitPayment => ({
        method,
        amount: String(amount),
        ...(method === "BANK_TRANSFER" ? { reference_note: transferRef ?? note } : {}),
        ...(method === "CARD" ? { reference_note: note } : {}),
      });
      // Chỉ một phần khác 0 (hoặc đơn 0 ₫) → gửi như thanh toán một phương thức
      if (parts.length <= 1) {
        const only = parts[0] ?? { method: "CASH" as const, amount: 0 };
        return {
          ok: true,
          payload: {
            payment:
              only.method === "CASH"
                ? { method: "CASH", cash_received: String(only.amount) }
                : { method: only.method, reference_note: only.method === "BANK_TRANSFER" ? (transferRef ?? note) : note },
          },
        };
      }
      return { ok: true, payload: { payments: parts.map(toSplit) } };
    }
  }
}
