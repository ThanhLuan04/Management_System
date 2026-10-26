import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router/dom";
import { Toaster } from "sonner";

import { router } from "./app/router";
import { AuthProvider } from "./features/auth/AuthProvider";
import { ApiError } from "./services/apiError";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      // Lỗi 4xx (sai quyền, không tìm thấy...) thử lại cũng vô ích; chỉ thử lại lỗi mạng / 5xx
      retry: (failureCount, error) =>
        failureCount < 2 && !(error instanceof ApiError && error.status >= 400 && error.status < 500),
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
      {/* Thành công: tự tắt 3s; lỗi: 6s — docs/05 §4 */}
      <Toaster richColors position="top-right" duration={3000} />
    </QueryClientProvider>
  </StrictMode>,
);
