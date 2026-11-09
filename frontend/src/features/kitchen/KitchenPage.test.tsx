import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { http } from "@/services/http";

import type { KitchenTicket } from "./api";
import { minutesSince, nextStatus, previousStatus } from "./api";
import { KitchenPage } from "./KitchenPage";

const NOW = new Date("2026-11-09T05:30:00Z").getTime();

const TICKET: KitchenTicket = {
  order_id: 501,
  code: "HD20261109-0012",
  queue_number: 12,
  service_type: "DINE_IN",
  table_label: "Bàn 5",
  note: null,
  cancelled: false,
  cancel_reason: null,
  cashier: "Thu Ngân",
  created_at: "2026-11-09T05:08:00Z", // chờ 22 phút
  items: [
    { id: 1, product_name: "Phở bò", unit: "tô", quantity: 2, note: "không hành", options: ["Lớn"], kitchen_status: "NEW", kitchen_updated_at: null },
    { id: 2, product_name: "Cơm tấm", unit: "đĩa", quantity: 1, note: null, options: [], kitchen_status: "COOKING", kitchen_updated_at: null },
  ],
};

const board = vi.hoisted(() => ({ tickets: [] as unknown[] }));

vi.mock("@/services/http", () => ({
  http: {
    get: vi.fn(async () => ({ data: board.tickets })),
    patch: vi.fn(async () => ({ data: {} })),
    post: vi.fn(async () => ({ data: {} })),
  },
}));

function renderKitchen() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <KitchenPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  board.tickets = [TICKET];
});

describe("KitchenPage", () => {
  it("shows the queue number, table, notes and how long the ticket has waited", async () => {
    renderKitchen();

    const ticket = await screen.findByRole("region", { name: "Phiếu Số 12" });
    expect(ticket).toHaveTextContent("Tại chỗ · Bàn 5");
    expect(within(ticket).getByText("→ không hành")).toBeInTheDocument();
    expect(within(ticket).getByText("22 phút")).toBeInTheDocument();
    expect(screen.getByText(/Chờ 2 · Đang làm 1 · Xong chờ giao 0 món/)).toBeInTheDocument();
  });

  it("moves one dish forward, or the whole ticket at once", async () => {
    renderKitchen();
    const ticket = await screen.findByRole("region", { name: "Phiếu Số 12" });

    await userEvent.click(within(ticket).getByRole("button", { name: "Bắt đầu: Phở bò" }));
    await vi.waitFor(() => expect(http.patch).toHaveBeenCalledWith("/kitchen/items/1", { status: "COOKING" }));

    await userEvent.click(within(ticket).getByRole("button", { name: "Xong cả phiếu" }));
    await vi.waitFor(() => expect(http.post).toHaveBeenCalledWith("/kitchen/tickets/501/status", { status: "READY" }));
  });

  it("flags a cancelled order and only lets the kitchen acknowledge it", async () => {
    board.tickets = [{ ...TICKET, cancelled: true, cancel_reason: "Khách đổi ý" }];
    renderKitchen();

    const ticket = await screen.findByRole("region", { name: "Phiếu Số 12" });
    expect(within(ticket).getByRole("alert")).toHaveTextContent("ĐÃ HỦY — dừng làm");
    expect(within(ticket).queryByRole("button", { name: /Bắt đầu/ })).not.toBeInTheDocument();

    await userEvent.click(within(ticket).getByRole("button", { name: "Đã biết" }));
    await vi.waitFor(() => expect(http.post).toHaveBeenCalledWith("/kitchen/tickets/501/acknowledge"));
  });

  it("prints the kitchen ticket, not the receipt", async () => {
    let printed: { mode?: string; text?: string | null } = {};
    const print = vi.spyOn(window, "print").mockImplementation(() => {
      printed = { mode: document.body.dataset.print, text: document.querySelector(".print-kitchen")?.textContent };
    });
    renderKitchen();

    await userEvent.click(await screen.findByRole("button", { name: "In phiếu Số 12" }));

    await vi.waitFor(() => expect(print).toHaveBeenCalled());
    expect(printed.mode).toBe("kitchen");
    expect(printed.text).toContain("Số 12");
    expect(printed.text).toContain("2 × Phở bò");
    expect(printed.text).not.toContain("₫"); // phiếu bếp không có giá tiền
    print.mockRestore();
  });

  it("says so when there is nothing to cook", async () => {
    board.tickets = [];
    renderKitchen();

    expect(await screen.findByText("Chưa có món nào cần làm")).toBeInTheDocument();
  });
});

describe("kitchen helpers", () => {
  it("steps through the flow one status at a time", () => {
    expect(nextStatus("NEW")).toBe("COOKING");
    expect(nextStatus("SERVED")).toBeNull();
    expect(previousStatus("NEW")).toBeNull();
    expect(previousStatus("READY")).toBe("COOKING");
    expect(minutesSince("2026-11-09T05:08:00Z", NOW)).toBe(22);
  });
});
