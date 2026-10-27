import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it, vi } from "vitest";

import { http } from "@/services/http";

import { UsersPage } from "./UsersPage";

const ROLES = [
  { id: 1, code: "ADMIN", name: "Quản trị viên" },
  { id: 3, code: "CASHIER", name: "Thu ngân" },
];
const ADMIN = { id: 1, username: "admin", full_name: "Quản trị", email: null, phone: null, role: ROLES[0], is_active: true, last_login_at: null, created_at: "" };
const CASHIER = { id: 5, username: "thungan1", full_name: "Lê Văn Nam", email: null, phone: null, role: ROLES[1], is_active: true, last_login_at: null, created_at: "" };

vi.mock("@/features/auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: 1 }, can: () => true }),
}));
vi.mock("@/services/http", () => ({
  http: {
    get: vi.fn(async (url: string) => {
      if (url === "/roles") return { data: ROLES };
      return { data: { items: [ADMIN, CASHIER], page: 1, page_size: 20, total: 2 } };
    }),
    patch: vi.fn(async (_url: string, body: object) => ({ data: { ...ADMIN, ...body } })),
  },
}));

function renderPage() {
  const router = createMemoryRouter([{ path: "/users", element: <UsersPage /> }], { initialEntries: ["/users"] });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

const rowOf = async (username: string) => (await screen.findByText(username)).closest("tr")!;

describe("UsersPage", () => {
  it("does not let an admin lock their own account", async () => {
    renderPage();

    expect(within(await rowOf("admin")).getByRole("button", { name: "Khóa" })).toBeDisabled();
    expect(within(await rowOf("thungan1")).getByRole("button", { name: "Khóa" })).toBeEnabled();
  });

  it("lets an admin edit their own profile without sending a role change", async () => {
    renderPage();

    await userEvent.click(within(await rowOf("admin")).getByRole("button", { name: "Sửa" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText(/Vai trò/)).toHaveAttribute("readonly");
    const name = within(dialog).getByLabelText(/Họ tên/);
    await userEvent.clear(name);
    await userEvent.type(name, "Quản trị viên chính");
    await userEvent.click(within(dialog).getByRole("button", { name: "Lưu" }));

    await vi.waitFor(() => expect(http.patch).toHaveBeenCalled());
    const [url, body] = vi.mocked(http.patch).mock.calls[0];
    expect(url).toBe("/users/1");
    expect(body).toMatchObject({ full_name: "Quản trị viên chính" });
    expect(body).not.toHaveProperty("role_id", expect.anything());
  });
});
