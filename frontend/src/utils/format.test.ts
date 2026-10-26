import { describe, expect, it } from "vitest";

import { addDays, formatDate, formatDateTime, formatMoney, formatMoneyCompact, vnToday } from "./format";

// Intl dùng khoảng trắng không ngắt (U+00A0) trước "₫" → chuẩn hóa để so sánh dễ đọc
const plain = (text: string) => text.replace(/ /g, " ");

describe("formatMoney", () => {
  it("formats API decimal strings as Vietnamese currency", () => {
    expect(plain(formatMoney("1250000.00"))).toBe("1.250.000 ₫");
    expect(plain(formatMoney(0))).toBe("0 ₫");
    expect(plain(formatMoney(null))).toBe("0 ₫");
  });

  it("keeps the sign for negative values", () => {
    expect(plain(formatMoney("-96000.00"))).toBe("-96.000 ₫");
  });
});

describe("formatMoneyCompact", () => {
  it.each([
    [950, "950"],
    [12_500, "12,5k"],
    [1_250_000, "1,25 tr"],
    [23_705_575, "23,7 tr"],
    [2_300_000_000, "2,3 tỷ"],
    [-96_000, "-96k"],
  ])("%d → %s", (value, expected) => {
    expect(formatMoneyCompact(value)).toBe(expected);
  });
});

describe("dates use Vietnam time", () => {
  it("formats plain dates without timezone shifts", () => {
    expect(formatDate("2026-10-01")).toBe("01/10/2026");
  });

  it("shows a UTC timestamp in Vietnam local time", () => {
    // 17:30 UTC ngày 01/10 = 00:30 ngày 02/10 giờ VN
    expect(formatDate("2026-10-01T17:30:00Z")).toBe("02/10/2026");
    expect(formatDateTime("2026-10-01T17:30:00Z")).toBe("00:30 02/10/2026");
  });

  it("computes today in Vietnam regardless of the browser timezone", () => {
    expect(vnToday(new Date("2026-10-01T18:00:00Z"))).toBe("2026-10-02");
  });

  it("adds days across month boundaries", () => {
    expect(addDays("2026-10-01", -1)).toBe("2026-09-30");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});
