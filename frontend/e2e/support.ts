import { expect, type Locator, type Page } from "@playwright/test";

/** Tạo sẵn bởi backend/scripts/e2e_server.py trên database test (bị xóa mỗi lần chạy). */
export const ADMIN = { username: "e2e_admin", password: "E2eAdmin123" };

export async function login(page: Page, username: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Tên đăng nhập").fill(username);
  await page.getByLabel("Mật khẩu").fill(password);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

/** Chọn option có chứa đoạn chữ (nhãn option thường kèm mã tự sinh, vd. "NCC0001 · Tên"). */
export async function selectOptionContaining(select: Locator, text: string) {
  const value = await select.locator("option", { hasText: text }).getAttribute("value");
  if (value === null) throw new Error(`Không có option chứa "${text}"`);
  await select.selectOption(value);
}

/** Số tiền như giao diện hiển thị: 45000 → /45\.000\s₫/ (Intl dùng khoảng trắng không ngắt). */
export function money(amount: number): RegExp {
  const grouped = new Intl.NumberFormat("vi-VN").format(amount).replace(/\./g, "\\.");
  return new RegExp(`${grouped}\\s₫`);
}

export function toast(page: Page, text: string | RegExp) {
  return page.locator("[data-sonner-toast]").filter({ hasText: text });
}
