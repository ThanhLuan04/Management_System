import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it, vi } from "vitest";

import { ApiError } from "@/services/apiError";
import { http } from "@/services/http";

import { ProductFormPage } from "./ProductFormPage";

vi.mock("@/services/http", () => ({
  http: {
    get: vi.fn(async (url: string) => {
      if (url === "/categories") {
        return { data: [{ id: 3, name: "Sữa", parent_id: null, is_active: true, children: [] }] };
      }
      if (url === "/brands") return { data: [{ id: 2, name: "Vinamilk", is_active: true }] };
      throw new Error(`unexpected GET ${url}`);
    }),
    post: vi.fn(async () => {
      throw new ApiError(409, "DUPLICATE_SKU", "Mã SKU đã tồn tại");
    }),
  },
}));

function renderNewProduct() {
  const router = createMemoryRouter([{ path: "/products/new", element: <ProductFormPage /> }], {
    initialEntries: ["/products/new"],
  });
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

async function fillValidForm() {
  await userEvent.type(screen.getByLabelText(/^SKU/), "sua-th-1l");
  await userEvent.type(screen.getByLabelText(/Tên sản phẩm/), "Sữa tươi TH 1L");
  await userEvent.selectOptions(await screen.findByLabelText(/Danh mục/), "3");
  await userEvent.type(screen.getByLabelText(/Đơn vị tính/), "hộp");
  await userEvent.type(screen.getByLabelText(/Giá bán/), "32000");
}

describe("ProductFormPage", () => {
  it("validates required fields before calling the API", async () => {
    renderNewProduct();

    await userEvent.click(screen.getByRole("button", { name: "Tạo sản phẩm" }));

    expect(await screen.findByText("Vui lòng nhập SKU")).toBeInTheDocument();
    expect(screen.getByText("Vui lòng chọn danh mục")).toBeInTheDocument();
    expect(screen.getByText("Vui lòng nhập giá bán")).toBeInTheDocument();
    expect(http.post).not.toHaveBeenCalled();
  });

  it("sends a normalized payload and shows a duplicate SKU under the SKU field", async () => {
    renderNewProduct();
    await fillValidForm();

    await userEvent.click(screen.getByRole("button", { name: "Tạo sản phẩm" }));

    expect(await screen.findByText("Mã SKU đã tồn tại")).toBeInTheDocument();
    expect(screen.getByLabelText(/^SKU/)).toHaveAttribute("aria-invalid", "true");
    expect(http.post).toHaveBeenCalledWith(
      "/products",
      expect.objectContaining({
        sku: "SUA-TH-1L", // viết hoa trước khi gửi
        sale_price: "32000", // không có dấu chấm phân cách
        category_id: 3,
        brand_id: null,
        barcode: null,
        min_stock: 0,
      }),
    );
  });
});
