/** Định dạng hiển thị theo chuẩn Việt Nam. Tiền từ API là chuỗi ("32000.00") để không mất độ chính xác. */

const VN_TIME_ZONE = "Asia/Ho_Chi_Minh";

const moneyFormatter = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" });
const numberFormatter = new Intl.NumberFormat("vi-VN");
const dateFormatter = new Intl.DateTimeFormat("vi-VN", {
  timeZone: VN_TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
const dateTimeFormatter = new Intl.DateTimeFormat("vi-VN", {
  timeZone: VN_TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const isoDateFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: VN_TIME_ZONE });

export function toNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === "") return 0;
  return typeof value === "number" ? value : Number(value);
}

/** "1250000.00" → "1.250.000 ₫" */
export function formatMoney(value: string | number | null | undefined): string {
  return moneyFormatter.format(toNumber(value));
}

export function formatNumber(value: string | number | null | undefined): string {
  return numberFormatter.format(toNumber(value));
}

/** Rút gọn cho trục biểu đồ: 1.250.000 → "1,25 tr"; 2.300.000.000 → "2,3 tỷ". */
export function formatMoneyCompact(value: number): string {
  const abs = Math.abs(value);
  const units: [number, string][] = [
    [1e9, " tỷ"],
    [1e6, " tr"],
    [1e3, "k"],
  ];
  for (const [size, unit] of units) {
    if (abs >= size) {
      const scaled = value / size;
      const digits = Math.abs(scaled) >= 100 ? 0 : Math.abs(scaled) >= 10 ? 1 : 2;
      return `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: digits }).format(scaled)}${unit}`;
    }
  }
  return numberFormatter.format(value);
}

/** Chuỗi "YYYY-MM-DD" (ngày thuần) hoặc ISO datetime → "dd/MM/yyyy" theo giờ VN. */
export function formatDate(value: string | Date): string {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-");
    return `${day}/${month}/${year}`;
  }
  return dateFormatter.format(new Date(value));
}

export function formatDateTime(value: string | Date): string {
  return dateTimeFormatter.format(new Date(value)).replace(",", "");
}

/** Ngày hôm nay theo giờ Việt Nam dạng "YYYY-MM-DD" (đúng kể cả khi máy người dùng ở múi giờ khác). */
export function vnToday(now: Date = new Date()): string {
  return isoDateFormatter.format(now);
}

/** Cộng/trừ ngày trên chuỗi "YYYY-MM-DD". */
export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
