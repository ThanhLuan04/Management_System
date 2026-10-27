// Đặt chế độ sáng/tối TRƯỚC khi trang hiển thị để không bị chớp trắng khi tải ở chế độ tối.
// File riêng (không viết inline trong index.html) vì CSP của Caddy chỉ cho chạy script từ chính trang: script-src 'self'.
// Phải khớp với src/features/theme/ThemeProvider.tsx (cùng khóa localStorage).
(function () {
  var preference = "system";
  try {
    preference = localStorage.getItem("smartstore-theme") || "system";
  } catch (e) {
    // Trình duyệt chặn localStorage (chế độ riêng tư...) → theo hệ điều hành
  }
  var dark = preference === "dark" || (preference === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
})();
