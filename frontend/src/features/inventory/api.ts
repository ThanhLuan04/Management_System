import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { StockTransaction } from "@/features/catalog/api";
import { http } from "@/services/http";
import type { Money, Page, UserRef } from "@/types/api";

export interface InventoryItem {
  product_id: number;
  sku: string;
  name: string;
  unit: string;
  category_name: string;
  is_active: boolean;
  quantity: number;
  min_stock: number;
  is_low_stock: boolean;
  avg_cost?: Money;
  stock_value?: Money;
}

export interface LedgerEntry extends StockTransaction {
  product_id: number;
  sku: string;
  product_name: string;
  avg_cost_after?: Money;
}

export type AdjustmentType = "ADJUSTMENT" | "STOCKTAKE";

export interface AdjustmentSummary {
  id: number;
  code: string;
  type: AdjustmentType;
  reason: string;
  note: string | null;
  item_count: number;
  created_by: UserRef;
  created_at: string;
}

export interface Adjustment extends AdjustmentSummary {
  items: {
    id: number;
    product_id: number;
    sku: string;
    product_name: string;
    quantity_before: number;
    quantity_change: number;
    counted_quantity: number | null;
    unit_cost?: Money;
  }[];
}

export interface AdjustmentPayload {
  type: AdjustmentType;
  reason: string;
  note: string | null;
  items: { product_id: number; quantity_change?: number; counted_quantity?: number }[];
}

export function useInventory(params: Record<string, unknown>) {
  return useQuery({
    queryKey: ["inventory", "list", params],
    queryFn: async () => (await http.get<Page<InventoryItem>>("/inventory", { params })).data,
    placeholderData: keepPreviousData,
  });
}

export function useLedger(params: Record<string, unknown>, enabled = true) {
  return useQuery({
    queryKey: ["inventory", "ledger", params],
    queryFn: async () => (await http.get<Page<LedgerEntry>>("/inventory/transactions", { params })).data,
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useAdjustments(params: Record<string, unknown>, enabled = true) {
  return useQuery({
    queryKey: ["inventory", "adjustments", params],
    queryFn: async () => (await http.get<Page<AdjustmentSummary>>("/inventory/adjustments", { params })).data,
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useAdjustment(id: number) {
  return useQuery({
    queryKey: ["inventory", "adjustment", id],
    queryFn: async () => (await http.get<Adjustment>(`/inventory/adjustments/${id}`)).data,
  });
}

export function useCreateAdjustment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: AdjustmentPayload) => (await http.post<Adjustment>("/inventory/adjustments", payload)).data,
    onSuccess: () => {
      for (const key of ["inventory", "products", "reports"]) queryClient.invalidateQueries({ queryKey: [key] });
    },
  });
}

/** Đường dẫn tới chứng từ gốc của một biến động kho. */
export function referenceLink(entry: Pick<StockTransaction, "reference_type" | "reference_id">): string | null {
  switch (entry.reference_type) {
    case "purchase_order":
      return `/purchases/${entry.reference_id}`;
    case "sales_order":
      return `/orders/${entry.reference_id}`;
    case "sales_return":
      return `/returns/${entry.reference_id}`;
    case "stock_adjustment":
      return `/inventory/adjustments/${entry.reference_id}`;
    default:
      return null;
  }
}
