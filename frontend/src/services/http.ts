import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";

import type { TokenResponse } from "@/types/api";

import { toApiError } from "./apiError";
import { singleFlight } from "./singleFlight";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";

/**
 * Access token chỉ nằm trong bộ nhớ (biến module) — không localStorage/sessionStorage,
 * nên script độc hại (XSS) không đọc được token đã lưu. Tải lại trang → lấy lại bằng cookie refresh HttpOnly.
 */
let accessToken: string | null = null;
let onSessionExpired: (() => void) | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function setSessionExpiredHandler(handler: () => void): void {
  onSessionExpired = handler;
}

export const http = axios.create({ baseURL: API_BASE_URL, withCredentials: true, timeout: 30_000 });

http.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

/** Gọi /auth/refresh — dùng chung một request cho mọi nơi gọi đồng thời. */
export const refreshSession = singleFlight(async (): Promise<TokenResponse> => {
  // Gọi bằng axios "trần" (không qua interceptor) để lỗi 401 ở đây không kích hoạt refresh lồng nhau
  const { data } = await axios.post<TokenResponse>(`${API_BASE_URL}/auth/refresh`, null, {
    withCredentials: true,
  });
  setAccessToken(data.access_token);
  return data;
});

type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean };

http.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as RetriableConfig | undefined;
    const isAuthEndpoint = config?.url?.startsWith("/auth/");
    if (error.response?.status === 401 && config && !config._retried && !isAuthEndpoint) {
      config._retried = true;
      try {
        await refreshSession();
        return http(config); // gửi lại request với token mới
      } catch {
        setAccessToken(null);
        onSessionExpired?.();
      }
    }
    return Promise.reject(toApiError(error));
  },
);
