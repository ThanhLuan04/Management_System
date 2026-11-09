import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { http } from "@/services/http";

import type { Product } from "./api";
import { foodCostPercent, RecipeEditor } from "./RecipeEditor";

vi.mock("@/services/http", () => ({
  http: {
    get: vi.fn(async () => ({ data: { items: [], page: 1, page_size: 8, total: 0 } })),
    put: vi.fn(async (_url: string, body: unknown) => ({ data: body })),
  },
}));

const BEEF = { id: 11, sku: "BO", name: "Thịt bò", unit: "g", kind: "INGREDIENT" as const, is_active: true, quantity: 1000, avg_cost: "180.0000" };
const NOODLE = { ...BEEF, id: 12, sku: "BANHPHO", name: "Bánh phở", quantity: 2000, avg_cost: "20.0000" };

function pho(overrides: Partial<Product> = {}): Product {
  return {
    id: 5, sku: "PHOBO", barcode: null, name: "Phở bò", kind: "DISH", category: { id: 1, name: "Món ăn" }, brand: null,
    unit: "tô", purchase_unit: null, purchase_factor: 1, sale_price: "50000.00", min_stock: 0, image_url: null,
    description: null, is_active: true, quantity: 6, is_low_stock: false, created_at: "", updated_at: "",
    recipe: [{ ingredient: BEEF, quantity: 150 }, { ingredient: NOODLE, quantity: 200 }],
    avg_cost: "31000.0000",
    modifier_groups: [],
    ...overrides,
  };
}

function renderEditor(dish: Product, canEdit = true) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RecipeEditor dish={dish} canEdit={canEdit} />
    </QueryClientProvider>,
  );
}

describe("RecipeEditor", () => {
  it("shows the estimated cost and food-cost share of the sale price", () => {
    renderEditor(pho());

    expect(screen.getByText("Giá vốn ước tính / phần").nextSibling).toHaveTextContent("31.000");
    expect(screen.getByText("Chi phí nguyên liệu / giá bán").nextSibling).toHaveTextContent("62%");
    expect(screen.getByText("Còn làm được").nextSibling).toHaveTextContent("6 tô");
  });

  it("recomputes cost while editing and saves whole-number quantities", async () => {
    renderEditor(pho());

    const beef = screen.getByLabelText("Định lượng Thịt bò");
    await userEvent.clear(beef);
    await userEvent.type(beef, "100");
    expect(screen.getByText("Giá vốn ước tính / phần").nextSibling).toHaveTextContent("22.000"); // 100 × 180 + 200 × 20
    await userEvent.click(screen.getByRole("button", { name: "Bỏ Bánh phở khỏi công thức" }));
    await userEvent.click(screen.getByRole("button", { name: "Lưu công thức" }));

    await vi.waitFor(() => expect(http.put).toHaveBeenCalled());
    expect(http.put).toHaveBeenCalledWith("/products/5/recipe", { items: [{ ingredient_id: 11, quantity: 100 }] });
  });

  it("refuses to save an empty quantity", async () => {
    renderEditor(pho());

    await userEvent.clear(screen.getByLabelText("Định lượng Thịt bò"));
    await userEvent.click(screen.getByRole("button", { name: "Lưu công thức" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Nhập định lượng (số nguyên > 0, theo g) cho Thịt bò");
    expect(http.put).not.toHaveBeenCalled();
  });

  it("warns that a dish without a recipe cannot be sold, and is read-only without permission", () => {
    renderEditor(pho({ recipe: [], quantity: 0, avg_cost: undefined }), false);

    expect(screen.getByRole("status")).toHaveTextContent("chưa bán được ở quầy");
    expect(screen.queryByRole("button", { name: "Lưu công thức" })).not.toBeInTheDocument();
    expect(screen.queryByText("Giá vốn ước tính / phần")).not.toBeInTheDocument(); // không có quyền xem giá vốn
  });

  it("lists read-only quantities with their unit", () => {
    renderEditor(pho(), false);

    const row = screen.getByText("Thịt bò").closest("tr")!;
    expect(within(row).getByText("150 g")).toBeInTheDocument();
  });
});

describe("foodCostPercent", () => {
  it("rounds to one decimal and has no value for a free item", () => {
    expect(foodCostPercent(31000, 50000)).toBe(62);
    expect(foodCostPercent(10000, 30000)).toBe(33.3);
    expect(foodCostPercent(1000, 0)).toBeNull();
  });
});
