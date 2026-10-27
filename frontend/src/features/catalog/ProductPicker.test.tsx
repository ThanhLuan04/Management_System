import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Product } from "./api";
import { ProductPicker } from "./ProductPicker";

function product(id: number, sku: string, name: string, barcode: string | null = null): Product {
  return {
    id,
    sku,
    barcode,
    name,
    category: { id: 1, name: "Đồ uống" },
    brand: null,
    unit: "lon",
    sale_price: "10000.00",
    min_stock: 0,
    image_url: null,
    description: null,
    is_active: true,
    quantity: 20,
    is_low_stock: false,
    created_at: "",
    updated_at: "",
  };
}

const CATALOG = [
  product(1, "COCA-330", "Coca-Cola lon 330ml", "8935049500018"),
  product(2, "COCA-1500", "Coca-Cola chai 1.5L"),
];

vi.mock("@/services/http", () => ({
  http: {
    get: vi.fn(async (_url: string, config: { params: { q: string } }) => {
      const q = config.params.q.toLowerCase();
      const items = CATALOG.filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().startsWith(q) || p.barcode === config.params.q);
      return { data: { items, page: 1, page_size: 8, total: items.length } };
    }),
  },
}));

function renderPicker() {
  const onSelect = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ProductPicker onSelect={onSelect} />
    </QueryClientProvider>,
  );
  return onSelect;
}

describe("ProductPicker", () => {
  it("lets the user pick a result with the keyboard", async () => {
    const onSelect = renderPicker();
    const input = screen.getByRole("combobox", { name: "Tìm sản phẩm" });

    await userEvent.type(input, "coca");
    expect(await screen.findAllByRole("option")).toHaveLength(2);
    await userEvent.keyboard("{ArrowDown}{Enter}");

    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ sku: "COCA-1500" }));
    expect(input).toHaveValue(""); // sẵn sàng cho sản phẩm tiếp theo
  });

  it("selects immediately when a scanner types an exact barcode and presses Enter", async () => {
    const onSelect = renderPicker();

    // Máy quét gõ rất nhanh rồi Enter — trước khi danh sách gợi ý kịp hiện
    await userEvent.type(screen.getByRole("combobox"), "8935049500018{Enter}", { delay: null });

    await vi.waitFor(() => expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ sku: "COCA-330" })));
  });

  it("does not auto-select on a partial match", async () => {
    const onSelect = renderPicker();

    await userEvent.type(screen.getByRole("combobox"), "coca{Enter}", { delay: null });

    expect(await screen.findAllByRole("option")).toHaveLength(2);
    expect(onSelect).not.toHaveBeenCalled();
  });
});
