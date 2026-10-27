import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { http } from "@/services/http";
import type { Money, Page, UserRef } from "@/types/api";

export type PurchaseStatus = "DRAFT" | "CONFIRMED" | "CANCELLED";

export interface PurchaseItem {
  id: number;
  product_id: number;
  sku: string;
  product_name: string;
  unit: string;
  quantity: number;
  unit_cost: Money;
  discount_amount: Money;
  line_total: Money;
}

export interface PurchaseSummary {
  id: number;
  code: string;
  status: PurchaseStatus;
  supplier: { id: number; code: string; name: string };
  total_amount: Money;
  item_count: number;
  note: string | null;
  created_by: UserRef;
  confirmed_by: UserRef | null;
  confirmed_at: string | null;
  cancelled_at: string | null;
  created_at: string;
}

export interface Purchase extends PurchaseSummary {
  items: PurchaseItem[];
}

export interface PurchasePayload {
  supplier_id: number;
  note: string | null;
  items: { product_id: number; quantity: number; unit_cost: string; discount_amount: string }[];
}

export function usePurchases(params: Record<string, unknown>) {
  return useQuery({
    queryKey: ["purchases", "list", params],
    queryFn: async () => (await http.get<Page<PurchaseSummary>>("/purchases", { params })).data,
    placeholderData: keepPreviousData,
  });
}

export function usePurchase(id: number | undefined) {
  return useQuery({
    queryKey: ["purchases", "detail", id],
    queryFn: async () => (await http.get<Purchase>(`/purchases/${id}`)).data,
    enabled: id !== undefined,
  });
}

/** Sau khi nhập kho: tồn kho, sản phẩm và báo cáo đều thay đổi → làm mới các dữ liệu liên quan. */
function useInvalidateAfterStockChange() {
  const queryClient = useQueryClient();
  return () => {
    for (const key of ["purchases", "products", "inventory", "reports"]) {
      queryClient.invalidateQueries({ queryKey: [key] });
    }
  };
}

export function useSavePurchase(id?: number) {
  const invalidate = useInvalidateAfterStockChange();
  return useMutation({
    mutationFn: async (payload: PurchasePayload) =>
      id === undefined
        ? (await http.post<Purchase>("/purchases", payload)).data
        : (await http.put<Purchase>(`/purchases/${id}`, payload)).data,
    onSuccess: invalidate,
  });
}

export function usePurchaseAction(id: number) {
  const invalidate = useInvalidateAfterStockChange();
  return useMutation({
    mutationFn: async (action: "confirm" | "cancel") => (await http.post<Purchase>(`/purchases/${id}/${action}`)).data,
    onSuccess: invalidate,
  });
}
