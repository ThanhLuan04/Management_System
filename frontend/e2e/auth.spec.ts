import { expect, test } from "@playwright/test";

import { ADMIN, login } from "./support";

test("chưa đăng nhập bị chuyển về trang đăng nhập, đăng nhập xong quay lại đúng trang", async ({ page }) => {
  await page.goto("/products");
  await expect(page).toHaveURL(/\/login/);

  await page.getByLabel("Tên đăng nhập").fill(ADMIN.username);
  await page.getByLabel("Mật khẩu").fill(ADMIN.password);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page).toHaveURL(/\/products$/);
});

test("sai mật khẩu thì báo lỗi và không vào được hệ thống", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Tên đăng nhập").fill(ADMIN.username);
  await page.getByLabel("Mật khẩu").fill("SaiMatKhau1");
  await page.getByRole("button", { name: "Đăng nhập" }).click();

  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test("phiên đăng nhập còn sau khi tải lại trang và mất hẳn sau khi đăng xuất", async ({ page, context }) => {
  await login(page, ADMIN.username, ADMIN.password);
  // Access token chỉ nằm trong bộ nhớ → tải lại trang phải khôi phục phiên bằng refresh cookie
  await page.reload();
  await expect(page.getByRole("heading", { name: "Tổng quan" })).toBeVisible();

  const refreshCookie = (await context.cookies()).find((c) => c.path === "/api/v1/auth");
  expect(refreshCookie, "refresh token phải nằm trong cookie").toBeDefined();
  expect(refreshCookie).toMatchObject({ httpOnly: true, secure: true, sameSite: "Strict" });

  await page.getByRole("button", { name: /Admin E2E/ }).click();
  await page.getByRole("menuitem", { name: "Đăng xuất" }).click();
  await expect(page).toHaveURL(/\/login/);

  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});

test("thu ngân không thấy và không dùng được chức năng quản trị", async ({ page, request }) => {
  const cashier = { username: "e2e_thungan_quyen", password: "E2eCash123" };

  // Tạo tài khoản thu ngân qua API bằng quyền Admin
  const auth = await request.post("/api/v1/auth/login", { data: ADMIN });
  const adminHeaders = { Authorization: `Bearer ${(await auth.json()).access_token}` };
  const roles: { id: number; code: string }[] = await (await request.get("/api/v1/roles", { headers: adminHeaders })).json();
  const created = await request.post("/api/v1/users", {
    headers: adminHeaders,
    data: { ...cashier, full_name: "Thu ngân phân quyền", role_id: roles.find((r) => r.code === "CASHIER")!.id },
  });
  expect(created.status()).toBe(201);
  const category = await (await request.post("/api/v1/categories", { headers: adminHeaders, data: { name: "Phân quyền E2E" } })).json();
  const product = await request.post("/api/v1/products", {
    headers: adminHeaders,
    data: { sku: "E2E-QUYEN", name: "Sản phẩm phân quyền", category_id: category.id, unit: "cái", sale_price: "1000", min_stock: 0 },
  });
  expect(product.status()).toBe(201);

  await login(page, cashier.username, cashier.password);
  await expect(page).toHaveURL(/\/pos/);

  const menu = page.getByRole("navigation", { name: "Menu chính" });
  await expect(menu.getByRole("link", { name: "Bán hàng" })).toBeVisible();
  for (const hidden of ["Người dùng", "Cài đặt", "Báo cáo", "Nhập hàng"]) {
    await expect(menu.getByRole("link", { name: hidden })).toHaveCount(0);
  }

  await page.goto("/users");
  await expect(page.getByRole("heading", { name: "Bạn không có quyền truy cập trang này" })).toBeVisible();

  // Giao diện chỉ ẩn trang; backend mới là nơi chặn thật
  const cashierAuth = await request.post("/api/v1/auth/login", { data: cashier });
  const cashierHeaders = { Authorization: `Bearer ${(await cashierAuth.json()).access_token}` };
  for (const url of ["/api/v1/users", "/api/v1/reports/inventory", "/api/v1/audit-logs"]) {
    expect((await request.get(url, { headers: cashierHeaders })).status(), url).toBe(403);
  }
  const editSettings = await request.patch("/api/v1/settings", { headers: cashierHeaders, data: { store_name: "Bị sửa" } });
  expect(editSettings.status()).toBe(403);

  // Thu ngân không được thấy giá vốn
  const products = await (await request.get("/api/v1/products", { headers: cashierHeaders })).json();
  expect(products.items.length).toBeGreaterThan(0);
  for (const product of products.items) expect(product).not.toHaveProperty("avg_cost");
});
