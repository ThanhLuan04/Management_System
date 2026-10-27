import { defineConfig, devices } from "@playwright/test";

// Backend và frontend riêng cho E2E (cổng 8001/5174) để không đụng server dev đang chạy (8000/5173).
// Backend E2E dựng lại database test từ đầu mỗi lần khởi động (backend/scripts/e2e_server.py).
const API_URL = "http://127.0.0.1:8001";
const APP_URL = "http://localhost:5174";
const PYTHON = process.platform === "win32" ? ".venv\\Scripts\\python.exe" : ".venv/bin/python";

export default defineConfig({
  testDir: "./e2e",
  // Các test dùng chung một database → chạy tuần tự, theo thứ tự file
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: APP_URL,
    locale: "vi-VN",
    timezoneId: "Asia/Ho_Chi_Minh",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: webServers(),
});

/** Dùng chung với playwright.screenshots.config.ts (backend thêm cờ --demo). */
export function webServers(backendArgs = "") {
  return [
    {
      command: `${PYTHON} -m scripts.e2e_server ${backendArgs}`.trim(),
      cwd: "../backend",
      url: `${API_URL}/api/v1/health`,
      reuseExistingServer: false, // luôn bắt đầu từ database sạch
      timeout: 120_000,
      stdout: "pipe" as const,
    },
    {
      command: "npx vite --port 5174 --strictPort",
      url: APP_URL,
      reuseExistingServer: false,
      timeout: 120_000,
      env: { SMARTSTORE_API_URL: API_URL },
    },
  ];
}
