import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { OrderSummary } from "@/features/dashboard/api";
import { http } from "@/services/http";
import type { Money, Page } from "@/types/api";

export interface Supplier {
  id: number;
  code: string;
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  tax_code: string | null;
  note: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Customer {
  id: number;
  code: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  note: string | null;
  is_active: boolean;
  order_count: number;
  total_spent: Money;
  created_at: string;
}

export type SupplierPayload = Partial<Omit<Supplier, "id" | "code" | "created_at">>;
export type CustomerPayload = Partial<Pick<Customer, "name" | "phone" | "email" | "address" | "note" | "is_active">>;

export function useSuppliers(params: Record<string, unknown>) {
  return useQuery({
    queryKey: ["suppliers", params],
    queryFn: async () => (await http.get<Page<Supplier>>("/suppliers", { params })).data,
    placeholderData: keepPreviousData,
  });
}

/** Danh sách nhà cung cấp cho ô chọn (≤ 100 — đủ cho cửa hàng nhỏ/vừa). */
export function useSupplierOptions(activeOnly = false) {
  return useQuery({
    queryKey: ["suppliers", "options", activeOnly],
    queryFn: async () =>
      (
        await http.get<Page<Supplier>>("/suppliers", {
          params: { page_size: 100, sort: "name", ...(activeOnly ? { is_active: true } : {}) },
        })
      ).data.items,
    staleTime: 5 * 60_000,
  });
}

export function useSaveSupplier(id?: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: SupplierPayload) =>
      id === undefined
        ? (await http.post<Supplier>("/suppliers", payload)).data
        : (await http.patch<Supplier>(`/suppliers/${id}`, payload)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["suppliers"] }),
  });
}

export function useCustomers(params: Record<string, unknown>) {
  return useQuery({
    queryKey: ["customers", "list", params],
    queryFn: async () => (await http.get<Page<Customer>>("/customers", { params })).data,
    placeholderData: keepPreviousData,
  });
}

export function useCustomer(id: number) {
  return useQuery({
    queryKey: ["customers", "detail", id],
    queryFn: async () => (await http.get<Customer>(`/customers/${id}`)).data,
  });
}

export function useCustomerOrders(id: number, params: Record<string, unknown>) {
  return useQuery({
    queryKey: ["customers", "orders", id, params],
    queryFn: async () => (await http.get<Page<OrderSummary>>(`/customers/${id}/orders`, { params })).data,
    placeholderData: keepPreviousData,
  });
}

export function useSaveCustomer(id?: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CustomerPayload) =>
      id === undefined
        ? (await http.post<Customer>("/customers", payload)).data
        : (await http.patch<Customer>(`/customers/${id}`, payload)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["customers"] }),
  });
}
