import { describe, expect, it } from "vitest";

import { defaultRefundMethod, estimateRefund, refundableByMethod } from "./refund";

describe("estimateRefund", () => {
  it("refunds the discounted line price, not the list price", () => {
    // Dòng 5 hộp, thành tiền sau giảm 144.000 (giá niêm yết 160.000) → trả 2 = 57.600
    expect(estimateRefund({ line_total: "144000.00", quantity: 5 }, 2)).toBe(57_600);
  });

  it("returns zero for no quantity", () => {
    expect(estimateRefund({ line_total: "144000.00", quantity: 5 }, 0)).toBe(0);
  });
});

describe("refundableByMethod", () => {
  it("subtracts earlier refunds per method and drops exhausted methods", () => {
    const remaining = refundableByMethod([
      { type: "PAYMENT", method: "CASH", amount: "14000.00" },
      { type: "PAYMENT", method: "BANK_TRANSFER", amount: "50000.00" },
      { type: "REFUND", method: "BANK_TRANSFER", amount: "32000.00" },
      { type: "PAYMENT", method: "CARD", amount: "5000.00" },
      { type: "REFUND", method: "CARD", amount: "5000.00" },
    ]);
    expect(remaining).toEqual({ CASH: 14000, BANK_TRANSFER: 18000 });
  });
});

describe("defaultRefundMethod", () => {
  it("prefers cash, otherwise the method with most money left", () => {
    expect(defaultRefundMethod({ CASH: 1000, CARD: 9000 })).toBe("CASH");
    expect(defaultRefundMethod({ BANK_TRANSFER: 1000, CARD: 9000 })).toBe("CARD");
    expect(defaultRefundMethod({})).toBeUndefined();
  });
});