/// <reference types="vitest/config" />
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

// Dùng 127.0.0.1 vì "localhost" có thể phân giải sang IPv6 (::1) trong khi uvicorn chỉ nghe IPv4
const BACKEND = "http://127.0.0.1:8000";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    port: 5173,
    // Dev: chuyển /api và /uploads sang backend để frontend và API cùng origin (cookie refresh hoạt động như production)
    proxy: {
      "/api": { target: BACKEND, changeOrigin: true },
      "/uploads": { target: BACKEND, changeOrigin: true },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    css: false,
    // Xóa lịch sử gọi của mọi mock giữa các test (thay cho mockClear/mockReset thủ công trong beforeEach)
    clearMocks: true,
  },
});
