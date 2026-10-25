import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    port: 5173,
    // Dev: chuyển /api sang backend để frontend và API cùng origin (cookie refresh hoạt động như production)
    proxy: {
      // Dùng 127.0.0.1 vì "localhost" có thể phân giải sang IPv6 (::1) trong khi uvicorn chỉ nghe IPv4
      "/api": { target: "http://127.0.0.1:8000", changeOrigin: true },
    },
  },
});
