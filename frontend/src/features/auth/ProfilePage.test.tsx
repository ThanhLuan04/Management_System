import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { http, setAccessToken } from "@/services/http";

import { AuthProvider } from "./AuthProvider";
import { ChangePasswordForm } from "./ProfilePage";

const ME = {
  id: 1,
  username: "quanly",
  full_name: "Phạm Thu Hà",
  email: null,
  phone: null,
  role: { id: 2, code: "MANAGER", name: "Quản lý cửa hàng" },
  permissions: [],
  last_login_at: null,
};

vi.mock("@/services/http", () => ({
  http: { post: vi.fn(async () => ({ data: { access_token: "new-token", token_type: "bearer", expires_in: 900, user: ME } })) },
  refreshSession: vi.fn(async () => ({ access_token: "old-token", user: ME })),
  setAccessToken: vi.fn(),
  setSessionExpiredHandler: vi.fn(),
}));

function renderForm() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AuthProvider>
        <ChangePasswordForm />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

async function fill(current: string, next: string, confirm: string) {
  await userEvent.type(screen.getByLabelText(/Mật khẩu hiện tại/), current);
  await userEvent.type(screen.getByLabelText(/^Mật khẩu mới/), next);
  await userEvent.type(screen.getByLabelText(/Nhập lại mật khẩu mới/), confirm);
  await userEvent.click(screen.getByRole("button", { name: "Đổi mật khẩu" }));
}

describe("ChangePasswordForm", () => {
  it("validates confirmation and password strength locally", async () => {
    renderForm();

    await fill("Demo@123", "abcdefgh", "abcdefgx");

    expect(await screen.findByText("Mật khẩu phải có cả chữ và số")).toBeInTheDocument();
    expect(screen.getByText("Mật khẩu nhập lại không khớp")).toBeInTheDocument();
    expect(http.post).not.toHaveBeenCalled();
  });

  it("keeps this device signed in with the new token returned by the server", async () => {
    renderForm();

    await fill("Demo@123", "MatKhauMoi1", "MatKhauMoi1");

    await vi.waitFor(() =>
      expect(http.post).toHaveBeenCalledWith("/auth/change-password", { current_password: "Demo@123", new_password: "MatKhauMoi1" }),
    );
    await vi.waitFor(() => expect(setAccessToken).toHaveBeenCalledWith("new-token"));
    expect(screen.getByLabelText(/Mật khẩu hiện tại/)).toHaveValue(""); // form được xóa sau khi đổi
  });
});
