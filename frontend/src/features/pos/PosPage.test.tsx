import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it, vi } from "vitest";

import { ApiError } from "@/services/apiError";
import { http } from "@/services/http";

import { PosPage } from "./PosPage";

const MILK = {
  id: 7,
  sku: "SUA-1L",
  barcode: "8930000000007",
  name: "Sữa tươi 1L",
  category: { id: 1, name: "Sữa" },
  brand: null,
  unit: "hộp",
  sale_price: "32000.00",
  min_stock: 0,
  image_url: null,
  description: null,
  is_active: true,
  quantity: 10,
  is_low_stock: false,
  created_at: "",
  updated_at: "",
};

const WATER = { ...MILK, id: 8, sku: "NUOC-500", barcode: null, name: "Nước suối 500ml", unit: "chai", sale_price: "5000.00", quantity: 0 };

const ORDER = {
  id: 501,
  code: "HD20261027-0001",
  status: "COMPLETED",
  return_status: "NONE",
  customer: null,
  subtotal: "64000.00",
  discount_amount: "0.00",
  discount_type: null,
  discount_value: "0.00",
  total_amount: "64000.00",
  item_count: 1,
  payment_method: "CASH",
  note: null,
  items: [],
  payments: [{ id: 1, type: "PAYMENT", method: "CASH", amount: "64000.00", cash_received: "100000.00", change_amount: "36000.00", reference_note: null, created_at: "" }],
  returns: [],
  created_by: { id: 3, full_name: "Thu Ngân" },
  created_at: "2026-10-27T03:00:00Z",
  cancelled_by: null,
  cancelled_at: null,
  cancel_reason: null,
};

vi.mock("@/services/http", () => ({
  http: {
    get: vi.fn(async (url: string) => {
      if (url === "/settings") {
        return { data: { store_name: "SmartStore", store_address: "", store_phone: "", return_window_days: 7, my_max_discount_percent: "10" } };
      }
      if (url === "/products") return { data: { items: [MILK, WATER], page: 1, page_size: 8, total: 2 } };
      if (url === "/categories") return { data: [{ id: 1, name: "Sữa", parent_id: null, is_active: true, children: [] }] };
      throw new Error(`unexpected GET ${url}`);
    }),
    post: vi.fn(),
  },
}));

function renderPos() {
  const router = createMemoryRouter([{ path: "/pos", element: <PosPage /> }], { initialEntries: ["/pos"] });
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

async function scanMilkTwiceAndPayCash() {
  const picker = screen.getByRole("combobox", { name: /Tìm sản phẩm để bán/ });
  await userEvent.type(picker, "8930000000007{Enter}", { delay: null });
  await userEvent.type(picker, "8930000000007{Enter}", { delay: null });
  await screen.findByLabelText("Số lượng Sữa tươi 1L");
  await userEvent.click(screen.getByRole("button", { name: "100.000" }));
}

const orderCalls = () => vi.mocked(http.post).mock.calls.filter(([url]) => url === "/orders");
const keyOf = (call: unknown[]) => (call[2] as { headers: Record<string, string> }).headers["Idempotency-Key"];

describe("PosPage — lưới sản phẩm", () => {
  it("shows products without searching and adds one to the cart on click", async () => {
    renderPos();

    const tile = await screen.findByRole("button", { name: /^Thêm Sữa tươi 1L/ });
    await userEvent.click(tile);
    await userEvent.click(tile);

    expect(screen.getByLabelText("Số lượng Sữa tươi 1L")).toHaveValue("2");
    expect(tile).toHaveTextContent("2"); // số lượng đang có trong giỏ hiện trên ô
  });

  it("disables out-of-stock products", async () => {
    renderPos();

    expect(await screen.findByRole("button", { name: /^Thêm Nước suối 500ml.*hết hàng/ })).toBeDisabled();
  });

  it("filters the grid by category", async () => {
    renderPos();

    await userEvent.click(await screen.findByRole("radio", { name: "Sữa" }));

    await vi.waitFor(() =>
      expect(vi.mocked(http.get)).toHaveBeenCalledWith("/products", { params: expect.objectContaining({ category_id: 1 }) }),
    );
  });
});

describe("PosPage", () => {
  it("sends only ids and quantities, and reuses the idempotency key when retrying after a network error", async () => {
    vi.mocked(http.post)
      .mockImplementationOnce(async () => {
        throw new ApiError(0, "NETWORK_ERROR", "Không kết nối được máy chủ");
      })
      .mockImplementationOnce(async () => ({ data: ORDER }));
    renderPos();
    await scanMilkTwiceAndPayCash();
    expect(screen.getByLabelText("Số lượng Sữa tươi 1L")).toHaveValue("2");

    await userEvent.click(screen.getByRole("button", { name: "Thanh toán (F9)" }));
    // Lần 1 lỗi mạng: giỏ hàng vẫn giữ nguyên để bấm lại
    await vi.waitFor(() => expect(screen.getByRole("button", { name: "Thanh toán (F9)" })).toBeEnabled());
    expect(screen.getByLabelText("Số lượng Sữa tươi 1L")).toHaveValue("2");
    await userEvent.click(screen.getByRole("button", { name: "Thanh toán (F9)" }));

    expect(await screen.findByText("Thanh toán thành công")).toBeInTheDocument();
    const [first, retry] = orderCalls();
    expect(first[1]).toEqual({
      customer_id: null,
      items: [{ product_id: 7, quantity: 2 }], // không gửi giá — server tự tính
      discount: null,
      payment: { method: "CASH", cash_received: "100000" },
      note: null,
    });
    expect(keyOf(retry)).toBe(keyOf(first)); // cùng key → server không tạo đơn trùng
  });

  it("starts the next sale with a new idempotency key", async () => {
    vi.mocked(http.post).mockImplementation(async () => ({ data: ORDER }));
    renderPos();

    await scanMilkTwiceAndPayCash();
    await userEvent.click(screen.getByRole("button", { name: "Thanh toán (F9)" }));
    await userEvent.click(await screen.findByRole("button", { name: "Đơn mới" }));
    await scanMilkTwiceAndPayCash();
    await userEvent.click(screen.getByRole("button", { name: "Thanh toán (F9)" }));

    await screen.findByText("Thanh toán thành công");
    const [firstSale, secondSale] = orderCalls();
    expect(keyOf(secondSale)).not.toBe(keyOf(firstSale));
  });

  it("marks the cart line when the server reports insufficient stock", async () => {
    vi.mocked(http.post).mockImplementation(async () => {
      throw new ApiError(409, "OUT_OF_STOCK", "Không đủ hàng trong kho", [{ product_id: 7, sku: "SUA-1L", requested: 2, available: 1 }]);
    });
    renderPos();

    await scanMilkTwiceAndPayCash();
    await userEvent.click(screen.getByRole("button", { name: "Thanh toán (F9)" }));

    expect(await screen.findByText("Chỉ còn 1 trong kho")).toBeInTheDocument();
  });

  it("blocks a discount above the cashier limit before calling the server", async () => {
    renderPos();
    await scanMilkTwiceAndPayCash();

    await userEvent.type(screen.getByLabelText("Giảm giá"), "15");
    await userEvent.click(screen.getByRole("button", { name: "Thanh toán (F9)" }));

    expect(await screen.findByText("Bạn chỉ được giảm tối đa 10% giá trị đơn")).toBeInTheDocument();
    expect(orderCalls()).toHaveLength(0);
  });
});
