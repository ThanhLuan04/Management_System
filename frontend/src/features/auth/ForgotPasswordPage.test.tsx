import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it, vi } from "vitest";

import { ApiError } from "@/services/apiError";

import * as authApi from "./api";
import { ForgotPasswordPage } from "./ForgotPasswordPage";

vi.mock("./api");

const SENT = "Nếu email thuộc một tài khoản đang hoạt động, mã xác nhận đã được gửi tới email đó.";

function renderPage() {
  const router = createMemoryRouter(
    [
      { path: "/forgot-password", element: <ForgotPasswordPage /> },
      { path: "/login", element: <p>Trang đăng nhập</p> },
    ],
    { initialEntries: ["/forgot-password"] },
  );
  render(<RouterProvider router={router} />);
}

async function sendCode(email = "chu@example.com") {
  vi.mocked(authApi.requestPasswordReset).mockResolvedValue(SENT);
  await userEvent.type(screen.getByLabelText(/Email của tài khoản/), email);
  await userEvent.click(screen.getByRole("button", { name: "Gửi mã xác nhận" }));
  await screen.findByLabelText(/Mã xác nhận/);
}

async function fillReset(code: string, password = "MatKhau@Moi9", confirm = password) {
  await userEvent.type(screen.getByLabelText(/Mã xác nhận/), code);
  await userEvent.type(screen.getByLabelText(/^Mật khẩu mới/), password);
  await userEvent.type(screen.getByLabelText(/Nhập lại mật khẩu mới/), confirm);
  await userEvent.click(screen.getByRole("button", { name: "Đặt mật khẩu mới" }));
}

describe("ForgotPasswordPage", () => {
  it("sends the code, then resets the password and returns to login", async () => {
    vi.mocked(authApi.resetPassword).mockResolvedValue();
    renderPage();

    await sendCode(" Chu@Example.com ");
    expect(authApi.requestPasswordReset).toHaveBeenCalledWith("Chu@Example.com");
    expect(screen.getByText(SENT, { exact: false })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Gửi lại sau \d+ giây/ })).toBeDisabled();

    await fillReset("123456");

    expect(authApi.resetPassword).toHaveBeenCalledWith("Chu@Example.com", "123456", "MatKhau@Moi9");
    expect(await screen.findByText("Trang đăng nhập")).toBeInTheDocument();
  });

  it("validates code format and password confirmation before calling the API", async () => {
    renderPage();
    await sendCode();

    await fillReset("12ab", "MatKhau@Moi9", "KhacNhau@9");

    expect(await screen.findByText("Mã gồm 6 chữ số")).toBeInTheDocument();
    expect(screen.getByText("Mật khẩu nhập lại không khớp")).toBeInTheDocument();
    expect(authApi.resetPassword).not.toHaveBeenCalled();
  });

  it("shows the server error on the code field for a wrong or expired code", async () => {
    vi.mocked(authApi.resetPassword).mockRejectedValue(
      new ApiError(400, "INVALID_RESET_CODE", "Mã xác nhận không đúng hoặc đã hết hạn. Hãy kiểm tra lại hoặc yêu cầu mã mới."),
    );
    renderPage();
    await sendCode();

    await fillReset("000000");

    expect(await screen.findByText(/Mã xác nhận không đúng hoặc đã hết hạn/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Mã xác nhận/)).toHaveAttribute("aria-invalid", "true");
  });

  it("rejects an invalid email before calling the API", async () => {
    renderPage();

    await userEvent.type(screen.getByLabelText(/Email của tài khoản/), "khong-phai-email");
    await userEvent.click(screen.getByRole("button", { name: "Gửi mã xác nhận" }));

    expect(await screen.findByText("Email không hợp lệ")).toBeInTheDocument();
    expect(authApi.requestPasswordReset).not.toHaveBeenCalled();
  });
});
