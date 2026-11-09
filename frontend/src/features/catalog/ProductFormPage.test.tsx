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
        kind: "GOODS",
        purchase_unit: null,
        purchase_factor: 1,
      }),
    );
  });

  it("creates an ingredient bought by the kg and stocked in grams, without a sale price", async () => {
    renderNewProduct();
    await userEvent.selectOptions(screen.getByLabelText(/^Loại/), "INGREDIENT");
    await userEvent.type(screen.getByLabelText(/^SKU/), "bo");
    await userEvent.type(screen.getByLabelText(/Tên sản phẩm/), "Thịt bò");
    await userEvent.selectOptions(await screen.findByLabelText(/Danh mục/), "3");
    await userEvent.type(screen.getByLabelText(/Đơn vị kho/), "g");

    expect(screen.queryByLabelText(/Giá bán/)).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/Đơn vị nhập/), "kg");
    await userEvent.click(screen.getByRole("button", { name: "Tạo sản phẩm" }));
    // Có đơn vị nhập mà 1 kg = 1 g → báo lỗi, chưa gửi
    expect(await screen.findByText("1 đơn vị nhập phải lớn hơn 1 đơn vị kho")).toBeInTheDocument();
    expect(http.post).not.toHaveBeenCalled();

    const factor = screen.getByLabelText(/1 kg bằng bao nhiêu g/);
    await userEvent.clear(factor);
    await userEvent.type(factor, "1000");
    await userEvent.click(screen.getByRole("button", { name: "Tạo sản phẩm" }));

    await vi.waitFor(() => expect(http.post).toHaveBeenCalled());
    expect(http.post).toHaveBeenCalledWith(
      "/products",
      expect.objectContaining({ kind: "INGREDIENT", unit: "g", sale_price: "0", purchase_unit: "kg", purchase_factor: 1000 }),
    );
  });

  it("a dish has no minimum stock or purchase unit", async () => {
    renderNewProduct();
    await userEvent.selectOptions(screen.getByLabelText(/^Loại/), "DISH");

    expect(screen.getByLabelText(/Giá bán/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Tồn tối thiểu/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Đơn vị nhập/)).not.toBeInTheDocument();
  });
});
