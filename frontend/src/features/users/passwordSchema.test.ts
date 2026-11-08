import { describe, expect, it } from "vitest";

import { passwordSchema } from "./passwordSchema";

const errorOf = (value: string) => passwordSchema.safeParse(value).error?.issues[0]?.message;

describe("passwordSchema (cùng quy tắc với backend)", () => {
  it.each(["Passw0rd!", "Demo@123", "Đường#2026", "Mật-khẩu-9X"])("accepts %s", (value) => {
    expect(passwordSchema.safeParse(value).success).toBe(true);
  });

  it.each([
    ["passw0rd!", "chữ hoa"],
    ["PASSW0RD!", "chữ thường"],
    ["Password!", "chữ số"],
    ["Passw0rd1", "ký tự đặc biệt"],
    ["Pass w0rd", "ký tự đặc biệt"], // khoảng trắng không tính là ký tự đặc biệt
  ])("names what %s is missing", (value, missing) => {
    expect(errorOf(value)).toBe(`Mật khẩu còn thiếu: ${missing}`);
  });

  it("treats Vietnamese capitals as upper case", () => {
    expect(passwordSchema.safeParse("đẹp#trai9Đ").success).toBe(true);
  });

  it("still requires 8 characters", () => {
    expect(errorOf("Aa1@")).toBe("Mật khẩu tối thiểu 8 ký tự");
  });
});
