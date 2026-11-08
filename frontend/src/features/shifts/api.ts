import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { http } from "@/services/http";
import type { Money, Page, UserRef } from "@/types/api";

export interface ShiftSummary {
  id: number;
  code: string;
  status: "OPEN" | "CLOSED";
  opening_cash: Money;
  opened_by: UserRef;
  opened_at: string;
  counted_cash: Money | null;
  /** Chốt lúc đóng ca; ca đang mở = null (xem current_expected_cash) */
  expected_cash: Money | null;
  /** Tiền đếm − tiền phải có (âm = thiếu) */
  difference: Money | null;
  close_note: string | null;
  closed_by: UserRef | null;
  closed_at: string | null;
}

export interface Shift extends ShiftSummary {
  current_expected_cash: Money;
  cash_received: Money;
  cash_refunded: Money;
  received_by_method: { method: string; amount: Money }[];
  refunded_by_method: { method: string; amount: Money }[];
  order_count: number;
  by_cashier: { user: UserRef; order_count: number; revenue: Money }[];
}

export interface ShiftCurrent {
  shift: Shift | null;
  suggested_opening_cash: Money;
}

const keys = { all: ["shifts"] as const, current: ["shifts", "current"] as const };

/** Ca đang mở của két chung (null = chưa mở ca → màn hình bán hàng yêu cầu mở ca). */
export function useCurrentShift() {
  return useQuery({
    queryKey: keys.current,
    queryFn: async () => (await http.get<ShiftCurrent>("/shifts/current")).data,
    // Két chung: người khác có thể mở / đóng ca ở máy khác → kiểm tra lại định kỳ
    refetchInterval: 60_000,
  });
}

export function useOpenShift() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (openingCash: string) => (await http.post<Shift>("/shifts/open", { opening_cash: openingCash })).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.all }),
  });
}

export function useCloseShift() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, countedCash, note }: { id: number; countedCash: string; note: string | null }) =>
      (await http.post<Shift>(`/shifts/${id}/close`, { counted_cash: countedCash, note })).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.all }),
  });
}

export function useShifts(params: Record<string, unknown>) {
  return useQuery({
    queryKey: [...keys.all, "list", params],
    queryFn: async () => (await http.get<Page<ShiftSummary>>("/shifts", { params })).data,
    placeholderData: keepPreviousData,
  });
}

export function useShift(id: number) {
  return useQuery({
    queryKey: [...keys.all, "detail", id],
    queryFn: async () => (await http.get<Shift>(`/shifts/${id}`)).data,
  });
}
