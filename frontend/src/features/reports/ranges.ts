import { addDays, vnToday } from "@/utils/format";

export const RANGE_PRESETS = [
  { id: "today", label: "Hôm nay" },
  { id: "7d", label: "7 ngày" },
  { id: "30d", label: "30 ngày" },
  { id: "90d", label: "90 ngày" },
  { id: "this_month", label: "Tháng này" },
  { id: "last_month", label: "Tháng trước" },
] as const;

export type RangePreset = (typeof RANGE_PRESETS)[number]["id"];

/** Khoảng ngày (YYYY-MM-DD, giờ VN, gồm cả hai đầu) cho một mốc chọn nhanh. */
export function presetRange(preset: RangePreset, today: string = vnToday()): { date_from: string; date_to: string } {
  switch (preset) {
    case "today":
      return { date_from: today, date_to: today };
    case "7d":
      return { date_from: addDays(today, -6), date_to: today };
    case "30d":
      return { date_from: addDays(today, -29), date_to: today };
    case "90d":
      return { date_from: addDays(today, -89), date_to: today };
    case "this_month":
      return { date_from: `${today.slice(0, 8)}01`, date_to: today };
    case "last_month": {
      const lastDayPrevMonth = addDays(`${today.slice(0, 8)}01`, -1);
      return { date_from: `${lastDayPrevMonth.slice(0, 8)}01`, date_to: lastDayPrevMonth };
    }
  }
}

/** Mốc nào khớp đúng khoảng đang chọn (để tô sáng nút), null nếu là khoảng tùy chọn. */
export function matchPreset(dateFrom: string, dateTo: string, today: string = vnToday()): RangePreset | null {
  return RANGE_PRESETS.find((p) => {
    const range = presetRange(p.id, today);
    return range.date_from === dateFrom && range.date_to === dateTo;
  })?.id ?? null;
}
