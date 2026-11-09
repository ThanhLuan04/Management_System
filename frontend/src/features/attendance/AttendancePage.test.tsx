import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { http } from "@/services/http";

import { AttendancePage } from "./AttendancePage";
import { ClockButton } from "./ClockButton";

const auth = vi.hoisted(() => ({ perms: new Set<string>() }));
vi.mock("@/features/auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: 9 }, can: (p: string) => auth.perms.has(p) }),
}));

const BEP = { id: 7, username: "bep1", full_name: "Trần Văn Bếp" };
const OPEN_ENTRY = {
  id: 1, user: BEP, clock_in_at: "2026-11-09T01:00:00Z", clock_out_at: null, minutes: 135,
  hourly_rate: "25000.00", pay: null, note: null, edited_by: null, forgotten: false,
};
const state = vi.hoisted(() => ({ current: null as unknown }));

vi.mock("@/services/http", () => ({
  http: {
    get: vi.fn(async (url: string) => {
      if (url === "/attendance/me")
        return { data: { current: state.current, month: { entry_count: 3, minutes: 690, pay: "287500.00" }, recent: [] } };
      if (url === "/attendance/summary")
        return {
          data: [
            { user: BEP, hourly_rate: "25000.00", entry_count: 3, minutes: 690, pay: "287500.00", open_entries: 1, forgotten: 1 },
            { user: { id: 8, username: "tn", full_name: "Lê Thu Ngân" }, hourly_rate: null, entry_count: 1, minutes: 60, pay: "0.00", open_entries: 0, forgotten: 0 },
          ],
        };
      if (url === "/attendance/staff") return { data: [{ id: 7, full_name: "Trần Văn Bếp", role: "Nhân viên bếp" }] };
      return { data: { items: [], page: 1, page_size: 20, total: 0 } };
    }),
    post: vi.fn(async () => ({ data: { ...OPEN_ENTRY, minutes: 0 } })),
  },
}));

function renderAt(path: string, element = <AttendancePage />) {
  const router = createMemoryRouter([{ path: "/attendance", element }], { initialEntries: [path] });
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  state.current = null;
});

describe("AttendancePage", () => {
  it("kitchen staff only see their own attendance and can clock in", async () => {
    auth.perms = new Set(["attendance.self"]);
    renderAt("/attendance?tab=summary"); // không có quyền → vẫn về tab "Của tôi"

    await userEvent.click(await screen.findByRole("button", { name: "Vào ca" }));

    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.getByText("11 giờ 30 phút")).toBeInTheDocument();
    await vi.waitFor(() => expect(http.post).toHaveBeenCalledWith("/attendance/clock-in"));
    expect(http.get).not.toHaveBeenCalledWith("/attendance/summary", expect.anything());
  });

  it("managers see hours, pay and forgotten clock-outs per person", async () => {
    auth.perms = new Set(["attendance.self", "attendance.manage"]);
    renderAt("/attendance?tab=summary");

    const row = (await screen.findByRole("button", { name: "Trần Văn Bếp" })).closest("tr")!;
    expect(within(row).getByText("11 giờ 30 phút")).toBeInTheDocument();
    expect(within(row).getByText("1 lượt quên ra ca?")).toBeInTheDocument();
    expect(within(screen.getByText("Lê Thu Ngân").closest("tr")!).getByText("Chưa đặt")).toBeInTheDocument();
    expect(within(screen.getByText("Tổng cộng").closest("tr")!).getByText("12 giờ 30 phút")).toBeInTheDocument();
  });

  it("adding a missed entry needs a reason and sends times with a timezone", async () => {
    auth.perms = new Set(["attendance.self", "attendance.manage"]);
    renderAt("/attendance?tab=entries");

    await userEvent.click(await screen.findByRole("button", { name: /Thêm lượt/ }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.selectOptions(within(dialog).getByLabelText(/Nhân viên/), await within(dialog).findByRole("option", { name: /Trần Văn Bếp/ }));
    await userEvent.type(within(dialog).getByLabelText(/Giờ vào/), "2026-11-08T07:00");
    await userEvent.type(within(dialog).getByLabelText(/Giờ ra/), "2026-11-08T15:30");
    await userEvent.click(within(dialog).getByRole("button", { name: "Lưu" }));

    expect(within(dialog).getByRole("alert")).toHaveTextContent("Ghi lý do");
    expect(http.post).not.toHaveBeenCalled();

    await userEvent.type(within(dialog).getByLabelText(/Lý do/), "Quên bấm vào ca");
    await userEvent.click(within(dialog).getByRole("button", { name: "Lưu" }));

    await vi.waitFor(() => expect(http.post).toHaveBeenCalled());
    expect(http.post).toHaveBeenCalledWith("/attendance", {
      user_id: 7,
      clock_in_at: new Date("2026-11-08T07:00").toISOString(),
      clock_out_at: new Date("2026-11-08T15:30").toISOString(),
      reason: "Quên bấm vào ca",
    });
  });
});

describe("ClockButton", () => {
  it("shows how long the person has been working and clocks out", async () => {
    auth.perms = new Set(["attendance.self"]);
    state.current = OPEN_ENTRY;
    renderAt("/attendance", <ClockButton />);

    const button = await screen.findByRole("button", { name: /Ra ca/ });
    expect(button).toHaveTextContent("2 giờ 15 phút");
    await userEvent.click(button);

    await vi.waitFor(() => expect(http.post).toHaveBeenCalledWith("/attendance/clock-out"));
  });

  it("is hidden for roles without attendance", () => {
    auth.perms = new Set();
    renderAt("/attendance", <ClockButton />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(http.get).not.toHaveBeenCalled();
  });
});
