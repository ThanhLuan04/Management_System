import { describe, expect, it } from "vitest";

import { matchPreset, presetRange } from "./ranges";

describe("presetRange", () => {
  it.each([
    ["today", "2026-10-27", "2026-10-27"],
    ["7d", "2026-10-21", "2026-10-27"],
    ["30d", "2026-09-28", "2026-10-27"],
    ["this_month", "2026-10-01", "2026-10-27"],
    ["last_month", "2026-09-01", "2026-09-30"],
  ] as const)("%s → %s..%s", (preset, from, to) => {
    expect(presetRange(preset, "2026-10-27")).toEqual({ date_from: from, date_to: to });
  });

  it("handles year boundaries and leap years for last month", () => {
    expect(presetRange("last_month", "2027-01-15")).toEqual({ date_from: "2026-12-01", date_to: "2026-12-31" });
    expect(presetRange("last_month", "2028-03-10")).toEqual({ date_from: "2028-02-01", date_to: "2028-02-29" });
  });
});

describe("matchPreset", () => {
  it("recognizes a preset range and returns null for custom ranges", () => {
    expect(matchPreset("2026-10-01", "2026-10-27", "2026-10-27")).toBe("this_month");
    expect(matchPreset("2026-10-02", "2026-10-27", "2026-10-27")).toBeNull();
  });
});
