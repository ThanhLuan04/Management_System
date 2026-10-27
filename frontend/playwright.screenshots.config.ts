import { defineConfig } from "@playwright/test";

import { webServers } from "./playwright.config";

// Chụp ảnh màn hình cho README: npm run screenshots → docs/screenshots/*.png
// Backend E2E nạp dữ liệu demo 60 ngày vào database test (không đụng DB dev).
export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.capture.ts",
  workers: 1,
  timeout: 120_000,
  reporter: "list",
  use: {
    baseURL: "http://localhost:5174",
    locale: "vi-VN",
    timezoneId: "Asia/Ho_Chi_Minh",
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    // Ô <input type="date"> hiển thị theo ngôn ngữ giao diện của trình duyệt (dd/mm/yyyy khi là tiếng Việt)
    launchOptions: { args: ["--lang=vi-VN"] },
  },
  webServer: webServers("--demo").map((server) => ({ ...server, timeout: 300_000 })),
});
