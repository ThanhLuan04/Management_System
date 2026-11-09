import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";

import { http } from "@/services/http";

import type { Product } from "./api";
import { GroupDialog, ModifiersPage } from "./ModifiersPage";
import { ProductModifiersCard } from "./ProductModifiersCard";

const SIZE = {
  id: 1,
  name: "Size",
  min_select: 1,
  max_select: 1,
  is_active: true,
  dish_count: 2,
  options: [
    { id: 10, name: "Vừa", price_delta: "0.00", ingredients: [] },
    {
      id: 11,
      name: "Lớn",
      price_delta: "10000.00",
      ingredients: [{ ingredient: { id: 5, sku: "BO", name: "Thịt bò", unit: "g" }, quantity: 50 }],
    },
  ],
};
const TOPPING = { ...SIZE, id: 2, name: "Topping", min_select: 0, max_select: 3, dish_count: 0, options: [{ id: 20, name: "Thêm trứng", price_delta: "5000.00", ingredients: [] }] };

vi.mock("@/features/auth/AuthProvider", () => ({ useAuth: () => ({ can: () => true }) }));
vi.mock("@/services/http", () => ({
  http: {
    get: vi.fn(async () => ({ data: [SIZE, TOPPING] })),
    post: vi.fn(async (_url: string, body: object) => ({ data: { ...body, id: 3, dish_count: 0 } })),
    put: vi.fn(async (_url: string, body: object) => ({ data: body })),
  },
}));

function renderWithQuery(ui: React.ReactNode) {
  render(
    <MemoryRouter>
      <QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>
    </MemoryRouter>,
  );
}

describe("ModifiersPage", () => {
  it("lists groups with their rule, price and extra ingredients", async () => {
    renderWithQuery(<ModifiersPage />);

    const size = await screen.findByRole("region", { name: "Nhóm Size" });
    expect(size).toHaveTextContent("Bắt buộc chọn 1 · 2 món đang dùng");
    expect(within(size).getByText(/\+10\.000/)).toBeInTheDocument();
    expect(within(size).getByText("Trừ thêm: 50 g Thịt bò")).toBeInTheDocument();
  });

  it("keeps ids of existing options, allows negative prices and checks the limits", async () => {
    const onClose = vi.fn();
    renderWithQuery(<GroupDialog group={SIZE} onClose={onClose} />);

    await userEvent.clear(screen.getByLabelText(/Chọn tối thiểu/));
    await userEvent.type(screen.getByLabelText(/Chọn tối thiểu/), "3");
    await userEvent.click(screen.getByRole("button", { name: "Lưu" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Tối thiểu không được lớn hơn tối đa");

    await userEvent.clear(screen.getByLabelText(/Chọn tối thiểu/));
    await userEvent.type(screen.getByLabelText(/Chọn tối thiểu/), "1");
    await userEvent.click(screen.getByRole("button", { name: "Thêm lựa chọn" }));
    await userEvent.type(screen.getByLabelText("Tên lựa chọn", { selector: "#option-name-2" }), "Nhỏ");
    const price = screen.getByLabelText(/Giá cộng thêm/, { selector: "#option-price-2" });
    await userEvent.clear(price);
    await userEvent.type(price, "-5000");
    await userEvent.click(screen.getByRole("button", { name: "Lưu" }));

    await vi.waitFor(() => expect(http.put).toHaveBeenCalled());
    expect(http.put).toHaveBeenCalledWith("/modifier-groups/1", {
      name: "Size",
      min_select: 1,
      max_select: 1,
      is_active: true,
      options: [
        { id: 10, name: "Vừa", price_delta: 0, ingredients: [] },
        { id: 11, name: "Lớn", price_delta: 10000, ingredients: [{ ingredient_id: 5, quantity: 50 }] },
        { name: "Nhỏ", price_delta: -5000, ingredients: [] },
      ],
    });
  });
});

describe("ProductModifiersCard", () => {
  it("saves the chosen groups in the order they were ticked", async () => {
    const dish = { id: 9, name: "Phở bò", kind: "DISH", modifier_groups: [] } as unknown as Product;
    renderWithQuery(<ProductModifiersCard dish={dish} canEdit />);

    await userEvent.click(await screen.findByRole("checkbox", { name: /Topping/ }));
    await userEvent.click(screen.getByRole("checkbox", { name: /Size/ }));
    await userEvent.click(screen.getByRole("button", { name: "Lưu tùy chọn" }));

    await vi.waitFor(() => expect(http.put).toHaveBeenCalledWith("/products/9/modifier-groups", { group_ids: [2, 1] }));
  });
});
