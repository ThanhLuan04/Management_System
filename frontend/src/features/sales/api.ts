import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { OrderSummary } from "@/features/dashboard/api";
import { http } from "@/services/http";
import type { Money, Page, UserRef } from "@/types/api";

export type { OrderSummary };
export type PaymentMethod = "CASH" | "BANK_TRANSFER" | "CARD";

export interface OrderItem {
  id: number;
  product_id: number;
  sku: string;
  product_name: string;
  unit: string;
  quantity: number;
  unit_price: Money;
  line_subtotal: Money;
  discount_allocated: Money;
  line_total: Money;
  returned_quantity: number;
  returnable_quantity: number;
  unit_cost?: Money;
}

export interface Payment {
  id: number;
  type: "PAYMENT" | "REFUND";
  method: PaymentMethod;
  amount: Money;
  cash_received: Money | null;
  change_amount: Money | null;
  reference_note: string | null;
  created_at: string;
}

export interface Order extends OrderSummary {
  subtotal: Money;
  discount_amount: Money;
  discount_type: "AMOUNT" | "PERCENT" | null;
  discount_value: Money;
  note: string | null;
  items: OrderItem[];
  payments: Payment[];
  returns: { id: number; code: string; total_refund: Money; created_at: string }[];
  cancelled_by: UserRef | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  gross_profit?: Money;
}

export interface OrderPayload {
  customer_id: number | null;
  items: { product_id: number; quantity: number }[];
  discount: { type: "AMOUNT" | "PERCENT"; value: string } | null;
  payment: { method: PaymentMethod; cash_received?: string; reference_note?: string | null };
  note: string | null;
}

export interface ReturnSummary {
  id: number;
  code: string;
  order: { id: number; code: string };
  customer: OrderSummary["customer"];
  reason: string;
  total_refund: Money;
  refund_method: PaymentMethod | null;
  item_count: number;
  created_by: UserRef;
  created_at: string;
}

export interface ReturnDetail extends ReturnSummary {
  items: {
    id: number;
    order_item_id: number;
    product_id: number;
    sku: string;
    product_name: string;
    quantity: number;
    condition: "RESELLABLE" | "DAMAGED";
    refund_amount: Money;
    unit_cost?: Money;
  }[];
}

export interface ReturnPayload {
  reason: string;
  items: { order_item_id: number; quantity: number; condition: "RESELLABLE" | "DAMAGED" }[];
}

export interface StoreSettings {
  store_name: string;
  store_address: string;
  store_phone: string;
  return_window_days: number;
  my_max_discount_percent: Money | null;
}

export interface MySales {
  date: string;
  order_count: number;
  gross_revenue: Money;
  refunds: Money;
  net_revenue: Money;
  received_by_method: { method: PaymentMethod; amount: Money }[];
  refunded_by_method: { method: PaymentMethod; amount: Money }[];
  cash_in_drawer: Money;
}

/** Bán / trả / hủy làm thay đổi đơn, tồn kho, sản phẩm, khách hàng và báo cáo → làm mới tất cả. */
function useInvalidateSales() {
  const queryClient = useQueryClient();
  return () => {
    for (const key of ["orders", "returns", "products", "inventory", "customers", "reports"]) {
      queryClient.invalidateQueries({ queryKey: [key] });
    }
  };
}

export function useOrders(params: Record<string, unknown>) {
  return useQuery({
    queryKey: ["orders", "list", params],
    queryFn: async () => (await http.get<Page<OrderSummary>>("/orders", { params })).data,
    placeholderData: keepPreviousData,
  });
}

export function useOrder(id: number) {
  return useQuery({
    queryKey: ["orders", "detail", id],
    queryFn: async () => (await http.get<Order>(`/orders/${id}`)).data,
  });
}

/** Tạo đơn: Idempotency-Key do màn hình POS giữ — bấm lại sau lỗi mạng dùng đúng key cũ, không tạo đơn trùng. */
export function useCreateOrder() {
  const invalidate = useInvalidateSales();
  return useMutation({
    mutationFn: async ({ payload, idempotencyKey }: { payload: OrderPayload; idempotencyKey: string }) =>
      (await http.post<Order>("/orders", payload, { headers: { "Idempotency-Key": idempotencyKey } })).data,
    onSuccess: invalidate,
  });
}

export function useCancelOrder(id: number) {
  const invalidate = useInvalidateSales();
  return useMutation({
    mutationFn: async (reason: string) => (await http.post<Order>(`/orders/${id}/cancel`, { reason })).data,
    onSuccess: invalidate,
  });
}

export function useCreateReturn(orderId: number) {
  const invalidate = useInvalidateSales();
  return useMutation({
    mutationFn: async ({ payload, idempotencyKey }: { payload: ReturnPayload; idempotencyKey: string }) =>
      (
        await http.post<ReturnDetail>(`/orders/${orderId}/returns`, payload, {
          headers: { "Idempotency-Key": idempotencyKey },
        })
      ).data,
    onSuccess: invalidate,
  });
}

export function useReturns(params: Record<string, unknown>) {
  return useQuery({
    queryKey: ["returns", "list", params],
    queryFn: async () => (await http.get<Page<ReturnSummary>>("/returns", { params })).data,
    placeholderData: keepPreviousData,
  });
}

export function useReturn(id: number) {
  return useQuery({
    queryKey: ["returns", "detail", id],
    queryFn: async () => (await http.get<ReturnDetail>(`/returns/${id}`)).data,
  });
}

export function useStoreSettings() {
  return useQuery({
    queryKey: ["settings"],
    queryFn: async () => (await http.get<StoreSettings>("/settings")).data,
    staleTime: 5 * 60_000,
  });
}

export function useMySales(enabled: boolean) {
  return useQuery({
    queryKey: ["reports", "my-sales"],
    queryFn: async () => (await http.get<MySales>("/reports/my-sales")).data,
    enabled,
  });
}

export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}
