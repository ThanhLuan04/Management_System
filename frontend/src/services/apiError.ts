import { isAxiosError } from "axios";

import type { FieldError } from "@/types/api";

/** Lỗi API đã chuẩn hóa từ định dạng {"error": {code, message, details}} của backend. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }

  /** Lỗi theo từng trường (422) → { field: message } để gắn vào form. */
  get fieldErrors(): Record<string, string> {
    if (!Array.isArray(this.details)) return {};
    return Object.fromEntries(
      (this.details as FieldError[]).filter((d) => d?.field).map((d) => [d.field, d.message]),
    );
  }
}

const NETWORK_MESSAGE = "Không kết nối được máy chủ. Kiểm tra mạng và thử lại.";

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (isAxiosError(error)) {
    const requestId = error.response?.headers?.["x-request-id"] as string | undefined;
    const body = error.response?.data?.error;
    if (error.response && body?.code) {
      return new ApiError(error.response.status, body.code, body.message, body.details, requestId);
    }
    // Backend luôn gắn X-Request-ID; thiếu header nghĩa là lỗi đến từ proxy (Vite/nginx)
    // khi backend không chạy hoặc không phản hồi.
    if (!error.response || !requestId) {
      return new ApiError(error.response?.status ?? 0, "NETWORK_ERROR", NETWORK_MESSAGE);
    }
    return new ApiError(error.response.status, "HTTP_ERROR", "Máy chủ trả về lỗi không xác định.", undefined, requestId);
  }
  return new ApiError(0, "UNKNOWN_ERROR", "Đã xảy ra lỗi không xác định.");
}
