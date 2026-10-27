import { type Browser, expect, type Page, test } from "@playwright/test";

import { login } from "./support";

/**
 * Chụp ảnh màn hình cho README trên dữ liệu demo (scripts/seed_demo.py, mật khẩu Demo@123).
 * Chạy: npm run screenshots → docs/screenshots/*.png
 */
const OUT = "../docs/screenshots";
const DEMO_PASSWORD = "Demo@123";

async function signedIn(browser: Browser, username: string, viewport?: { width: number; height: number }) {
  // Context tạo tay không nhận `use` trong config → khai báo lại ngôn ngữ/múi giờ (ô ngày hiển thị dd/mm/yyyy)
  const locale = { locale: "vi-VN", timezoneId: "Asia/Ho_Chi_Minh" };
  const context = await browser.newContext(
    viewport ? { ...locale, viewport, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { ...locale, viewport: { width: 1440, height: 900 } },
  );
  const page = await context.newPage();
  await login(page, username, DEMO_PASSWORD);
  return page;
}

async function shoot(page: Page, name: string, path?: string) {
  if (path) await page.goto(path);
  await page.waitForLoadState("networkidle");
  // Trang tải theo nhu cầu: chờ trang mới hiện tiêu đề, hết skeleton / spinner rồi mới chụp
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  await expect(page.locator(".animate-pulse, [role=status]")).toHaveCount(0);
  // Recharts vẽ đường dần trong ~1,5s
  if (await page.locator(".recharts-surface").count()) await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/${name}.png` });
}

test("chụp ảnh màn hình", async ({ browser, page }) => {
  await page.goto("/login");
  await shoot(page, "01-login");

  const manager = await signedIn(browser, "quanly");
  await shoot(manager, "02-dashboard", "/dashboard");
  await shoot(manager, "05-products", "/products");
  await shoot(manager, "06-inventory", "/inventory");
  await manager.goto("/reports");
  await manager.getByRole("radio", { name: "30 ngày" }).click();
  await shoot(manager, "07-reports");

  await manager.goto("/orders");
  await manager.waitForLoadState("networkidle");
  await shoot(manager, "04-orders");
  await manager.getByRole("link", { name: /^HD/ }).first().click();
  await expect(manager.getByRole("heading", { name: /^Đơn hàng HD/ })).toBeVisible();
  await shoot(manager, "08-order-detail");

  const cashier = await signedIn(browser, "thungan1");
  await cashier.waitForURL(/\/pos/);
  const picker = cashier.getByRole("combobox", { name: /Tìm sản phẩm để bán/ });
  for (const sku of ["COCA-330", "COCA-330", "HEINEKEN-330", "LAVIE-500", "PEPSI-330"]) {
    await picker.fill(sku);
    await picker.press("Enter");
    await expect(picker).toHaveValue(""); // đã thêm vào giỏ → ô tìm được xóa
  }
  await cashier.getByLabel("Khách đưa").fill("200000");
  await picker.blur();
  await shoot(cashier, "03-pos");

  const mobile = await signedIn(browser, "quanly", { width: 390, height: 844 });
  await shoot(mobile, "09-dashboard-mobile", "/dashboard");
});
