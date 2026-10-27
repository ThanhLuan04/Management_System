/**
 * Tính tiền phiếu nhập ở giao diện để XEM TRƯỚC — backend tính lại khi lưu (cùng công thức):
 *   thành tiền dòng = số lượng × đơn giá − chiết khấu
 * Dùng số nguyên đồng để tránh sai số dấu phẩy động.
 */
export interface DraftLine {
  quantity: string;
  unit_cost: string;
  discount_amount: string;
}

function toInt(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

export function lineGross(line: DraftLine): number {
  return toInt(line.quantity) * toInt(line.unit_cost);
}

export function lineTotal(line: DraftLine): number {
  return lineGross(line) - toInt(line.discount_amount);
}

export function purchaseTotals(lines: DraftLine[]) {
  return {
    quantity: lines.reduce((sum, l) => sum + toInt(l.quantity), 0),
    gross: lines.reduce((sum, l) => sum + lineGross(l), 0),
    discount: lines.reduce((sum, l) => sum + toInt(l.discount_amount), 0),
    total: lines.reduce((sum, l) => sum + lineTotal(l), 0),
  };
}
