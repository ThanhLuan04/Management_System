import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { http } from "@/services/http";

import type { Shift } from "./api";
import { CloseShiftDialog, OpenShiftCard } from "./components";

vi.mock("@/services/http", () => ({ http: { get: vi.fn(), post: vi.fn(async () => ({ data: { code: "CA20261108-0002" } })) } }));

const SHIFT: Shift = {
  id: 9,
  code: "CA20261108-0001",
  status: "OPEN",
  opening_cash: "500000.00",
  opened_by: { id: 3, full_name: "Lê Văn Nam" },
  opened_at: "2026-11-08T00:00:00Z",
  counted_cash: null,
  expected_cash: null,
  difference: null,
  close_note: null,
  closed_by: null,
  closed_at: null,
  current_expected_cash: "564000.00",
  cash_received: "96000.00",
  cash_refunded: "32000.00",
  received_by_method: [
    { method: "CASH", amount: "96000.00" },
    { method: "BANK_TRANSFER", amount: "50000.00" },
  ],
  refunded_by_method: [{ method: "CASH", amount: "32000.00" }],
  order_count: 3,
  by_cashier: [
    { user: { id: 3, full_name: "Lê Văn Nam" }, order_count: 2, revenue: "114000.00" },
    { user: { id: 4, full_name: "Nguyễn Thị Mai" }, order_count: 1, revenue: "32000.00" },
  ],
};

function wrap(ui: ReactNode) {
  render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);
}

describe("OpenShiftCard", () => {
  it("pre-fills the cash counted at the previous close and opens the shift", async () => {
    wrap(<OpenShiftCard suggested="132000.00" />);

    expect(screen.getByLabelText("Tiền đầu ca")).toHaveValue("132000"); // ô tự focus → hiện chữ số thô khi đang nhập
    await userEvent.click(screen.getByRole("button", { name: "Mở ca" }));

    expect(http.post).toHaveBeenCalledWith("/shifts/open", { opening_cash: "132000" });
  });
});

describe("CloseShiftDialog", () => {
  it("shows the expected cash and who sold what in the shared drawer", () => {
    wrap(<CloseShiftDialog shift={SHIFT} open onOpenChange={() => {}} />);

    expect(screen.getByText("Tiền mặt phải có").nextSibling).toHaveTextContent("564.000");
    expect(screen.getByText("Lê Văn Nam · 2 đơn")).toBeInTheDocument();
    expect(screen.getByText("Nguyễn Thị Mai · 1 đơn")).toBeInTheDocument();
  });

  it("closes without a note when the count matches", async () => {
    wrap(<CloseShiftDialog shift={SHIFT} open onOpenChange={() => {}} />);

    await userEvent.type(screen.getByLabelText(/Tiền đếm được trong két/), "564000");
    expect(screen.getByText("Khớp")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Đóng ca" }));

    expect(http.post).toHaveBeenCalledWith("/shifts/9/close", { counted_cash: "564000", note: null });
  });

  it("requires a reason when the drawer is short", async () => {
    wrap(<CloseShiftDialog shift={SHIFT} open onOpenChange={() => {}} />);

    await userEvent.type(screen.getByLabelText(/Tiền đếm được trong két/), "554000");
    expect(screen.getByText(/Thiếu 10\.000/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Đóng ca" }));

    expect(await screen.findByText(/hãy ghi lý do chênh lệch/)).toBeInTheDocument();
    expect(http.post).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText(/Lý do chênh lệch/), "Thối nhầm");
    await userEvent.click(screen.getByRole("button", { name: "Đóng ca" }));
    expect(http.post).toHaveBeenCalledWith("/shifts/9/close", { counted_cash: "554000", note: "Thối nhầm" });
  });
});
