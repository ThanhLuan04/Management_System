import { describe, expect, it } from "vitest";

import { estimateRefund } from "./refund";

describe("estimateRefund", () => {
  it("refunds the discounted line price, not the list price", () => {
    // Dòng 5 hộp, thành tiền sau giảm 144.000 (giá niêm yết 160.000) → trả 2 = 57.600
    expect(estimateRefund({ line_total: "144000.00", quantity: 5 }, 2)).toBe(57_600);
  });

  it("returns zero for no quantity", () => {
    expect(estimateRefund({ line_total: "144000.00", quantity: 5 }, 0)).toBe(0);
  });
});
