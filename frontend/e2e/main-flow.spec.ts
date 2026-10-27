import { expect, type Page, test } from "@playwright/test";

import { ADMIN, login, money, selectOptionContaining, toast } from "./support";

/**
 * Kịch bản chính của đặc tả: Admin tạo sản phẩm, nhà cung cấp, nhập hàng → thu ngân bán → trả hàng → báo cáo.
 * Số liệu được chọn để kiểm tra được bằng tay:
 *   nhập 20 × 10.000 ₫ → bán 3 × 15.000 ₫ = 45.000 ₫ → trả 1 (còn bán được) → hoàn 15.000 ₫
 *   tồn: 20 → 17 → 18; doanh thu thuần 30.000 ₫, giá vốn 2 × 10.000 = 20.000 ₫, lợi nhuận gộp 10.000 ₫
 */
const PRODUCT = { sku: "E2E-TRA", barcode: "8930000000017", name: "Trà xanh E2E 500ml" };
const CASHIER = { username: "e2e_thungan", password: "E2eCash123", fullName: "Thu ngân E2E" };

async function expectStock(page: Page, quantity: number) {
  await page.goto("/inventory");
  const row = page.getByRole("row").filter({ hasText: PRODUCT.name });
  await expect(row.getByRole("cell").nth(2)).toHaveText(new RegExp(`^${quantity}`));
}

function stat(page: Page, label: string) {
  return page.getByRole("region", { name: "Tổng kỳ" }).getByRole("group", { name: label, exact: true });
}

test("nhập hàng → bán → trả hàng → báo cáo", async ({ browser }) => {
  const adminContext = await browser.newContext();
  const admin = await adminContext.newPage();

  await test.step("1. Admin đăng nhập", async () => {
    await login(admin, ADMIN.username, ADMIN.password);
    await expect(admin).toHaveURL(/\/dashboard/);
  });

  await test.step("Admin tạo tài khoản thu ngân", async () => {
    await admin.goto("/users");
    await admin.getByRole("button", { name: "Thêm người dùng" }).click();
    const dialog = admin.getByRole("dialog");
    await dialog.getByLabel("Tên đăng nhập").fill(CASHIER.username);
    await dialog.getByLabel("Mật khẩu").fill(CASHIER.password);
    await dialog.getByLabel("Họ tên").fill(CASHIER.fullName);
    await dialog.getByLabel("Vai trò").selectOption({ label: "Thu ngân" });
    await dialog.getByRole("button", { name: "Lưu" }).click();
    await expect(toast(admin, `Đã tạo tài khoản ${CASHIER.username}`)).toBeVisible();
  });

  await test.step("2. Tạo danh mục và sản phẩm", async () => {
    await admin.goto("/categories");
    await admin.getByRole("button", { name: "Thêm danh mục" }).click();
    await admin.getByRole("dialog").getByLabel("Tên danh mục").fill("Đồ uống E2E");
    await admin.getByRole("dialog").getByRole("button", { name: "Lưu" }).click();
    await expect(admin.getByRole("dialog")).toBeHidden();

    await admin.goto("/products/new");
    await admin.getByLabel("SKU").fill(PRODUCT.sku);
    await admin.getByLabel("Mã vạch").fill(PRODUCT.barcode);
    await admin.getByLabel("Tên sản phẩm").fill(PRODUCT.name);
    await selectOptionContaining(admin.getByLabel("Danh mục"), "Đồ uống E2E");
    await admin.getByLabel("Đơn vị tính").fill("chai");
    await admin.getByLabel("Giá bán").fill("15000");
    await admin.getByLabel("Tồn tối thiểu").fill("5");
    await admin.getByRole("button", { name: "Tạo sản phẩm" }).click();
    await expect(toast(admin, "Đã tạo sản phẩm")).toBeVisible();
    await expect(admin).toHaveURL(/\/products\/\d+\/edit/);
  });

  await test.step("3. Tạo nhà cung cấp", async () => {
    await admin.goto("/suppliers");
    await admin.getByRole("button", { name: "Thêm nhà cung cấp" }).click();
    const dialog = admin.getByRole("dialog");
    await dialog.getByLabel("Tên nhà cung cấp").fill("Công ty Phân phối E2E");
    await dialog.getByLabel("Số điện thoại").fill("0901234567");
    await dialog.getByRole("button", { name: "Lưu" }).click();
    await expect(toast(admin, /Đã tạo nhà cung cấp NCC/)).toBeVisible();
  });

  await test.step("4. Tạo phiếu nhập và xác nhận nhập kho", async () => {
    await admin.goto("/purchases/new");
    await selectOptionContaining(admin.getByLabel("Nhà cung cấp"), "Công ty Phân phối E2E");
    const picker = admin.getByRole("combobox", { name: "Thêm sản phẩm vào phiếu" });
    await picker.fill(PRODUCT.sku);
    await picker.press("Enter");
    await admin.getByLabel(`Số lượng ${PRODUCT.name}`).fill("20");
    await admin.getByLabel(`Giá nhập ${PRODUCT.name}`).fill("10000");
    await expect(admin.getByText("Tổng giá trị phiếu:").locator("..")).toContainText(money(200_000));
    await admin.getByRole("button", { name: "Lưu nháp" }).click();
    await expect(admin.getByRole("heading", { name: /Phiếu nhập PN/ })).toBeVisible();

    await admin.getByRole("button", { name: "Xác nhận nhập kho" }).click();
    await admin.getByRole("dialog").getByRole("button", { name: "Xác nhận nhập kho" }).click();
    await expect(toast(admin, "Đã nhập kho thành công")).toBeVisible();
  });

  await test.step("5. Kiểm tra tồn kho sau nhập: 20", async () => {
    await expectStock(admin, 20);
  });

  const cashierContext = await browser.newContext();
  const cashier = await cashierContext.newPage();

  await test.step("6–7. Thu ngân bán 3 sản phẩm, thanh toán tiền mặt", async () => {
    await login(cashier, CASHIER.username, CASHIER.password);
    await expect(cashier).toHaveURL(/\/pos/);

    // Máy quét mã vạch: gõ mã rồi Enter
    const picker = cashier.getByRole("combobox", { name: "Tìm sản phẩm để bán (F2)" });
    await picker.fill(PRODUCT.barcode);
    await picker.press("Enter");
    await cashier.getByLabel(`Số lượng ${PRODUCT.name}`).fill("3");
    await expect(cashier.getByText("Khách cần trả").locator("..")).toContainText(money(45_000));

    await cashier.getByLabel("Khách đưa").fill("50000");
    await cashier.getByRole("button", { name: "Thanh toán (F9)" }).click();

    const done = cashier.getByRole("dialog", { name: "Thanh toán thành công" });
    await expect(done).toContainText(money(45_000));
    await expect(done).toContainText(/Tiền thừa:\s*5\.000\s₫/);
    await done.getByRole("link", { name: "Xem đơn" }).click();
    await expect(cashier.getByRole("heading", { name: /Đơn hàng HD/ })).toBeVisible();
  });

  await test.step("8. Kiểm tra tồn kho sau bán: 17", async () => {
    await expectStock(admin, 17);
  });

  await test.step("9. Thu ngân trả 1 sản phẩm còn bán được", async () => {
    await cashier.getByRole("button", { name: "Trả hàng" }).click();
    const dialog = cashier.getByRole("dialog");
    await dialog.getByLabel(`Số lượng trả ${PRODUCT.name}`).fill("1");
    await dialog.getByLabel("Lý do trả hàng").fill("Khách đổi ý");
    await expect(dialog.getByText("Tiền hoàn dự kiến").locator("..")).toContainText(money(15_000));
    await dialog.getByRole("button", { name: "Xác nhận trả hàng" }).click();
    await expect(toast(cashier, /Đã tạo phiếu trả TH.* — hoàn 15\.000\s₫/)).toBeVisible();

    await expectStock(admin, 18);
  });

  await test.step("10. Báo cáo hôm nay khớp số liệu", async () => {
    await admin.goto("/reports");
    await admin.getByRole("radio", { name: "Hôm nay" }).click();
    await expect(stat(admin, "Doanh thu gộp")).toContainText(money(45_000));
    await expect(stat(admin, "Tiền hoàn trả")).toContainText(money(15_000));
    await expect(stat(admin, "Doanh thu thuần")).toContainText(money(30_000));
    await expect(stat(admin, "Giá vốn hàng bán")).toContainText(money(20_000));
    await expect(stat(admin, "Lợi nhuận gộp")).toContainText(money(10_000));
  });

  await adminContext.close();
  await cashierContext.close();
});
