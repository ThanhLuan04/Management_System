import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { type Column, DataTable, Pagination } from "./DataTable";

type Row = { id: number; sku: string };
const columns: Column<Row>[] = [{ key: "sku", header: "SKU", sortKey: "sku", cell: (r) => r.sku }];

describe("DataTable", () => {
  it("toggles sort direction from the column header", async () => {
    const onSort = vi.fn();
    const { rerender } = render(
      <DataTable caption="t" columns={columns} rows={[{ id: 1, sku: "A" }]} rowKey={(r) => r.id} isPending={false} onSort={onSort} emptyTitle="" />,
    );

    await userEvent.click(screen.getByRole("button", { name: /SKU/ }));
    expect(onSort).toHaveBeenLastCalledWith("sku");

    rerender(
      <DataTable caption="t" columns={columns} rows={[{ id: 1, sku: "A" }]} rowKey={(r) => r.id} isPending={false} onSort={onSort} sort="sku" emptyTitle="" />,
    );
    expect(screen.getByRole("columnheader")).toHaveAttribute("aria-sort", "ascending");
    await userEvent.click(screen.getByRole("button", { name: /SKU/ }));
    expect(onSort).toHaveBeenLastCalledWith("-sku");
  });

  it("shows the empty state title", () => {
    render(<DataTable caption="t" columns={columns} rows={[]} rowKey={(r) => r.id} isPending={false} emptyTitle="Chưa có sản phẩm" />);

    expect(screen.getByText("Chưa có sản phẩm")).toBeInTheDocument();
  });
});

describe("Pagination", () => {
  it("shows the visible range and disables impossible moves", () => {
    render(<Pagination page={3} pageSize={20} total={45} onPageChange={() => {}} onPageSizeChange={() => {}} />);

    expect(screen.getByText("41–45")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Trang sau" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Trang trước" })).toBeEnabled();
  });
});
