import { http } from "@/services/http";
import type { TokenResponse } from "@/types/api";

export async function login(username: string, password: string): Promise<TokenResponse> {
  const { data } = await http.post<TokenResponse>("/auth/login", { username, password });
  return data;
}

export async function logout(): Promise<void> {
  await http.post("/auth/logout");
}

/** Gửi mã 6 số qua email. Server luôn trả cùng một câu, dù email có thuộc tài khoản nào hay không. */
export async function requestPasswordReset(email: string): Promise<string> {
  const { data } = await http.post<{ message: string }>("/auth/forgot-password", { email });
  return data.message;
}

export async function resetPassword(email: string, code: string, newPassword: string): Promise<void> {
  await http.post("/auth/reset-password", { email, code, new_password: newPassword });
}
