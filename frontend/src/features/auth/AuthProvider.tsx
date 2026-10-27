import { useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { refreshSession, setAccessToken, setSessionExpiredHandler } from "@/services/http";
import type { Me } from "@/types/api";

import * as authApi from "./api";
import type { Permission } from "./permissions";

type AuthStatus = "loading" | "authenticated" | "anonymous";

interface AuthContextValue {
  status: AuthStatus;
  user: Me | null;
  login: (username: string, password: string) => Promise<Me>;
  logout: () => Promise<void>;
  can: (...permissions: Permission[]) => boolean;
  /** Nhận phiên mới (sau đổi mật khẩu) hoặc thông tin user mới (sau sửa hồ sơ) */
  applySession: (session: { user: Me; access_token?: string }) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<Me | null>(null);

  const clearSession = useCallback(() => {
    setAccessToken(null);
    setUser(null);
    setStatus("anonymous");
    queryClient.clear(); // không để lộ dữ liệu của phiên trước cho người đăng nhập sau
  }, [queryClient]);

  // Khởi động: dùng cookie refresh (HttpOnly) để khôi phục phiên sau khi tải lại trang
  useEffect(() => {
    let cancelled = false;
    refreshSession()
      .then((session) => {
        if (cancelled) return;
        setUser(session.user);
        setStatus("authenticated");
      })
      .catch(() => {
        if (!cancelled) setStatus("anonymous");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setSessionExpiredHandler(clearSession);
  }, [clearSession]);

  const login = useCallback(async (username: string, password: string) => {
    const session = await authApi.login(username, password);
    setAccessToken(session.access_token);
    setUser(session.user);
    setStatus("authenticated");
    return session.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      clearSession();
    }
  }, [clearSession]);

  const can = useCallback(
    (...permissions: Permission[]) => !!user && permissions.every((p) => user.permissions.includes(p)),
    [user],
  );

  const applySession = useCallback((session: { user: Me; access_token?: string }) => {
    if (session.access_token) setAccessToken(session.access_token);
    setUser(session.user);
  }, []);

  const value = useMemo(
    () => ({ status, user, login, logout, can, applySession }),
    [status, user, login, logout, can, applySession],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth phải được dùng bên trong <AuthProvider>");
  return context;
}
