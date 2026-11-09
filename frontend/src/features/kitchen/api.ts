import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { KitchenStatus, ServiceType } from "@/features/sales/api";
import { http } from "@/services/http";

export interface KitchenItem {
  id: number;
  product_name: string;
  unit: string;
  quantity: number;
  note: string | null;
  kitchen_status: KitchenStatus;
  kitchen_updated_at: string | null;
}

export interface KitchenTicket {
  order_id: number;
  code: string;
  queue_number: number | null;
  service_type: ServiceType | null;
  table_label: string | null;
  note: string | null;
  /** Đơn bị hủy khi bếp chưa giao xong — dừng làm, bấm "Đã biết" để ẩn */
  cancelled: boolean;
  cancel_reason: string | null;
  cashier: string;
  created_at: string;
  items: KitchenItem[];
}

const keys = { tickets: ["kitchen", "tickets"] as const };

/** Màn hình bếp hỏi máy chủ mỗi 5 giây (đơn giản, bền hơn WebSocket cho quán nhỏ). */
export const KITCHEN_POLL_MS = 5_000;

export function useKitchenTickets() {
  return useQuery({
    queryKey: keys.tickets,
    queryFn: async () => (await http.get<KitchenTicket[]>("/kitchen/tickets")).data,
    refetchInterval: KITCHEN_POLL_MS,
    // Màn hình bếp thường để chạy cả ngày trên một máy riêng, vẫn phải cập nhật khi cửa sổ không được chọn
    refetchIntervalInBackground: true,
  });
}

export function useKitchenAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      action:
        | { type: "item"; itemId: number; status: KitchenStatus }
        | { type: "ticket"; orderId: number; status: KitchenStatus }
        | { type: "acknowledge"; orderId: number },
    ) => {
      if (action.type === "item") await http.patch(`/kitchen/items/${action.itemId}`, { status: action.status });
      else if (action.type === "ticket") await http.post(`/kitchen/tickets/${action.orderId}/status`, { status: action.status });
      else await http.post(`/kitchen/tickets/${action.orderId}/acknowledge`);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.tickets }),
  });
}

const FLOW: KitchenStatus[] = ["NEW", "COOKING", "READY", "SERVED"];

export function nextStatus(status: KitchenStatus): KitchenStatus | null {
  return FLOW[FLOW.indexOf(status) + 1] ?? null;
}

export function previousStatus(status: KitchenStatus): KitchenStatus | null {
  return FLOW[FLOW.indexOf(status) - 1] ?? null;
}

/** Số phút từ lúc đặt — để bếp ưu tiên phiếu chờ lâu. */
export function minutesSince(iso: string, now: number = Date.now()): number {
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000));
}
