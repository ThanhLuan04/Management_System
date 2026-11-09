import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { http } from "@/services/http";
import type { Money, Page, UserRef } from "@/types/api";

export interface TimeEntry {
  id: number;
  user: UserRef;
  clock_in_at: string;
  clock_out_at: string | null;
  /** Số phút làm (lượt đang mở: tính đến hiện tại) */
  minutes: number;
  hourly_rate: Money;
  /** null khi chưa ra ca */
  pay: Money | null;
  /** Lý do khi quản lý thêm / sửa tay */
  note: string | null;
  edited_by: UserRef | null;
  /** Đang mở quá 16 giờ — có thể quên bấm ra ca */
  forgotten: boolean;
}

export interface AttendanceMe {
  current: TimeEntry | null;
  month: { entry_count: number; minutes: number; pay: Money };
  recent: TimeEntry[];
}

export interface SummaryRow {
  user: UserRef;
  hourly_rate: Money | null;
  entry_count: number;
  minutes: number;
  pay: Money;
  open_entries: number;
  forgotten: number;
}

const keys = { all: ["attendance"] as const, me: ["attendance", "me"] as const };

/** "8 giờ 30 phút", "45 phút". */
export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} phút`;
  return m === 0 ? `${h} giờ` : `${h} giờ ${m} phút`;
}

export function useMyAttendance(enabled = true) {
  return useQuery({
    queryKey: keys.me,
    queryFn: async () => (await http.get<AttendanceMe>("/attendance/me")).data,
    enabled,
    // Cập nhật số phút đang làm trên nút ở thanh tiêu đề
    refetchInterval: 60_000,
  });
}

export function useClock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (action: "clock-in" | "clock-out") => (await http.post<TimeEntry>(`/attendance/${action}`)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.all }),
  });
}

export function useAttendanceSummary(params: { date_from: string; date_to: string }) {
  return useQuery({
    queryKey: [...keys.all, "summary", params],
    queryFn: async () => (await http.get<SummaryRow[]>("/attendance/summary", { params })).data,
    placeholderData: keepPreviousData,
  });
}

export function useAttendanceEntries(params: Record<string, unknown>) {
  return useQuery({
    queryKey: [...keys.all, "list", params],
    queryFn: async () => (await http.get<Page<TimeEntry>>("/attendance", { params })).data,
    placeholderData: keepPreviousData,
  });
}

export function useStaff(enabled: boolean) {
  return useQuery({
    queryKey: [...keys.all, "staff"],
    queryFn: async () => (await http.get<{ id: number; full_name: string; role: string }[]>("/attendance/staff")).data,
    enabled,
    staleTime: 5 * 60_000,
  });
}

/** <input type="datetime-local"> dùng giờ địa phương không kèm múi giờ: "2026-11-09T07:30". */
export function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Ngược lại: giờ địa phương trong ô → ISO có múi giờ để gửi máy chủ. */
export function fromLocalInput(value: string): string {
  return new Date(value).toISOString();
}

export interface EntryPayload {
  clock_in_at: string;
  clock_out_at: string | null;
  reason: string;
}

export function useSaveEntry(id?: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: EntryPayload & { user_id?: number }) =>
      id
        ? (await http.patch<TimeEntry>(`/attendance/${id}`, payload)).data
        : (await http.post<TimeEntry>("/attendance", payload)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.all }),
  });
}

export function useDeleteEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: number; reason: string }) =>
      http.delete(`/attendance/${id}`, { params: { reason } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.all }),
  });
}
