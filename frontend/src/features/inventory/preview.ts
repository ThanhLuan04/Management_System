import type { AdjustmentType } from "./api";

export interface AdjustmentLineInput {
  current: number;
  /** ADJUSTMENT: số thay đổi (có thể âm), STOCKTAKE: số đếm thực tế */
  value: string;
}

export interface AdjustmentPreview {
  change: number | null;
  after: number | null;
  error: string | null;
}

/**
 * Xem trước một dòng điều chỉnh/kiểm kê (backend tính lại trên tồn đã khóa khi lưu):
 * - Điều chỉnh: tồn sau = tồn hiện tại + thay đổi (thay đổi khác 0, không làm tồn âm)
 * - Kiểm kê: chênh lệch = số đếm − tồn hiện tại (0 = khớp sổ, backend bỏ qua dòng này)
 */
export function previewLine(type: AdjustmentType, line: AdjustmentLineInput): AdjustmentPreview {
  const raw = line.value.trim();
  if (raw === "") return { change: null, after: null, error: type === "STOCKTAKE" ? "Nhập số đếm" : "Nhập số lượng" };

  if (type === "STOCKTAKE") {
    if (!/^\d{1,7}$/.test(raw)) return { change: null, after: null, error: "Số đếm là số nguyên ≥ 0" };
    const counted = Number(raw);
    return { change: counted - line.current, after: counted, error: null };
  }

  if (!/^[+-]?\d{1,7}$/.test(raw)) return { change: null, after: null, error: "Nhập số nguyên, ví dụ -3 hoặc 5" };
  const change = Number(raw);
  if (change === 0) return { change: 0, after: line.current, error: "Số thay đổi phải khác 0" };
  const after = line.current + change;
  if (after < 0) return { change, after, error: `Chỉ còn ${line.current} trong kho` };
  return { change, after, error: null };
}
