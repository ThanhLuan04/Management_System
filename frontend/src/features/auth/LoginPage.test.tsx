import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it, vi } from "vitest";

import { ApiError } from "@/services/apiError";

import * as authApi from "./api";
import { AuthProvider } from "./AuthProvider";
import { LoginPage } from "./LoginPage";

vi.mock("./api");
vi.mock("@/services/http", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/http")>()),
  // Không có cookie phiên → khởi động ở trạng thái chưa đăng nhập
  refreshSession: vi.fn().mockRejectedValue(new Error("no session")),
}));

function renderLogin() {
  const router = createMemoryRouter(
    [
      { path: "/login", element: <LoginPage /> },
      { path: "/dashboard", element: <p>Trang Tổng quan</p> },
      { path: "/pos", element: <p>Trang Bán hàng</p> },
      { path: "/settings", element: <p>Trang Cài đặt</p> },
    ],
    // Phiên trước hết hạn khi đang ở /settings: đăng nhập xong KHÔNG quay lại đó mà vào trang chủ theo vai trò
    { initialEntries: [{ pathname: "/login", state: { from: { pathname: "/settings" } } }] },
  );
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("LoginPage", () => {
  it("shows field errors without calling the API", async () => {
    renderLogin();

    await userEvent.click(screen.getByRole("button", { name: "Đăng nhập" }));

    expect(await screen.findByText("Tên đăng nhập tối thiểu 3 ký tự")).toBeInTheDocument();
    expect(screen.getByText("Vui lòng nhập mật khẩu")).toBeInTheDocument();
    expect(screen.getByLabelText(/Tên đăng nhập/)).toHaveAttribute("aria-invalid", "true");
    expect(authApi.login).not.toHaveBeenCalled();
  });

  it("shows the server message on wrong credentials", async () => {
    vi.mocked(authApi.login).mockImplementation(async () => {
      throw new ApiError(401, "INVALID_CREDENTIALS", "Tên đăng nhập hoặc mật khẩu không đúng");
    });
    renderLogin();

    await userEvent.type(screen.getByLabelText(/Tên đăng nhập/), "admin");
    await userEvent.type(screen.getByLabelText(/Mật khẩu/), "sai-mat-khau");
    await userEvent.click(screen.getByRole("button", { name: "Đăng nhập" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Tên đăng nhập hoặc mật khẩu không đúng");
    expect(authApi.login).toHaveBeenCalledWith("admin", "sai-mat-khau");
  });

  it("explains when the account is temporarily locked", async () => {
    vi.mocked(authApi.login).mockRejectedValue(
      new ApiError(403, "ACCOUNT_LOCKED", "Tài khoản tạm thời bị khóa", { locked_until: "2026-10-27T03:15:00Z" }),
    );
    renderLogin();

    await userEvent.type(screen.getByLabelText(/Tên đăng nhập/), "admin");
    await userEvent.type(screen.getByLabelText(/Mật khẩu/), "x");
    await userEvent.click(screen.getByRole("button", { name: "Đăng nhập" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Thử lại sau 10:15 27/10/2026");
  });

  it.each([
    ["ADMIN", "Quản trị viên", "Trang Tổng quan"],
    ["MANAGER", "Quản lý cửa hàng", "Trang Tổng quan"],
    ["CASHIER", "Thu ngân", "Trang Bán hàng"],
  ] as const)("sends %s to their home page, not to the page open before login", async (code, roleName, home) => {
    vi.mocked(authApi.login).mockResolvedValue({
      access_token: "token",
      token_type: "bearer",
      expires_in: 900,
      user: {
        id: 1,
        username: "nguoidung",
        full_name: "Người dùng",
        email: null,
        phone: null,
        role: { id: 1, code, name: roleName },
        permissions: [],
        last_login_at: null,
      },
    });
    renderLogin();

    await userEvent.type(screen.getByLabelText(/Tên đăng nhập/), "nguoidung");
    await userEvent.type(screen.getByLabelText(/Mật khẩu/), "Admin@123");
    await userEvent.click(screen.getByRole("button", { name: "Đăng nhập" }));

    expect(await screen.findByText(home)).toBeInTheDocument();
    expect(screen.queryByText("Trang Cài đặt")).not.toBeInTheDocument();
  });
});
