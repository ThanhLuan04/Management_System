import { describe, expect, it } from "vitest";

import { lineTotal, purchaseTotals } from "./calc";

describe("purchase calculations (same formula as backend)", () => {
  it("matches the example in the API doc", () => {
    const lines = [
      { quantity: "20", unit_cost: "9500", discount_amount: "0" },
      { quantity: "24", unit_cost: "5000", discount_amount: "12000" },
    ];

    expect(lines.map(lineTotal)).toEqual([190_000, 108_000]);
    expect(purchaseTotals(lines)).toEqual({ quantity: 44, gross: 310_000, discount: 12_000, total: 298_000 });
  });

  it("treats empty or invalid inputs as zero instead of NaN", () => {
    expect(purchaseTotals([{ quantity: "", unit_cost: "abc", discount_amount: "" }])).toEqual({
      quantity: 0,
      gross: 0,
      discount: 0,
      total: 0,
    });
  });
});
