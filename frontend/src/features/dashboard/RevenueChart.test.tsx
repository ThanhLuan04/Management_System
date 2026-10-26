import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import type { RevenueRow } from "./api";
import { RevenueChart } from "./RevenueChart";

const rows: RevenueRow[] = [
  {
    period: "2026-10-01",
    order_count: 2,
    gross_revenue: "180000.00",
    refunds: "0.00",
    net_revenue: "180000.00",
    cogs: "57000.00",
    gross_profit: "123000.00",
  },
  {
    period: "2026-10-03",
    order_count: 0,
    gross_revenue: "0.00",
    refunds: "96000.00",
    net_revenue: "-96000.00",
    cogs: "-18000.00",
    gross_profit: "-78000.00",
  },
];

describe("RevenueChart", () => {
  it("always shows a legend for its two series", () => {
    render(<RevenueChart rows={rows} groupBy="day" />);

    const legend = screen.getByRole("list", { name: "Chú thích" });
    expect(within(legend).getByText("Doanh thu thuần")).toBeInTheDocument();
    expect(within(legend).getByText("Lợi nhuận gộp")).toBeInTheDocument();
  });

  it("offers a table view with every value", async () => {
    render(<RevenueChart rows={rows} groupBy="day" />);

    await userEvent.click(screen.getByRole("button", { name: "Xem dạng bảng" }));

    const table = screen.getByRole("table");
    const bodyRows = within(table).getAllByRole("row").slice(1);
    expect(bodyRows).toHaveLength(2);
    expect(bodyRows[0]).toHaveTextContent("01/10/2026");
    expect(bodyRows[0]).toHaveTextContent(/180\.000/);
    expect(bodyRows[1]).toHaveTextContent(/-96\.000/);
    expect(screen.getByRole("button", { name: "Xem biểu đồ" })).toHaveAttribute("aria-pressed", "true");
  });
});
