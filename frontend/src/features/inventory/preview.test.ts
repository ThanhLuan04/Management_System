import { describe, expect, it } from "vitest";

import { previewLine } from "./preview";

describe("previewLine — adjustment", () => {
  it("adds or removes stock", () => {
    expect(previewLine("ADJUSTMENT", { current: 10, value: "-3" })).toEqual({ change: -3, after: 7, error: null });
    expect(previewLine("ADJUSTMENT", { current: 10, value: "+5" })).toEqual({ change: 5, after: 15, error: null });
  });

  it("rejects zero, non-integers and negative stock", () => {
    expect(previewLine("ADJUSTMENT", { current: 10, value: "0" }).error).toBe("Số thay đổi phải khác 0");
    expect(previewLine("ADJUSTMENT", { current: 10, value: "1.5" }).error).toMatch(/số nguyên/);
    expect(previewLine("ADJUSTMENT", { current: 2, value: "-3" }).error).toBe("Chỉ còn 2 trong kho");
  });
});

describe("previewLine — stocktake", () => {
  it("computes the difference against the book quantity", () => {
    expect(previewLine("STOCKTAKE", { current: 10, value: "8" })).toEqual({ change: -2, after: 8, error: null });
    expect(previewLine("STOCKTAKE", { current: 10, value: "10" })).toEqual({ change: 0, after: 10, error: null });
  });

  it("requires a non-negative count", () => {
    expect(previewLine("STOCKTAKE", { current: 10, value: "" }).error).toBe("Nhập số đếm");
    expect(previewLine("STOCKTAKE", { current: 10, value: "-1" }).error).toMatch(/≥ 0/);
  });
});
