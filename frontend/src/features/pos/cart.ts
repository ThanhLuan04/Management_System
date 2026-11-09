/**
 * Giỏ hàng POS — chỉ để XEM TRƯỚC. Backend tính lại toàn bộ khi tạo đơn (không tin số tiền từ client).
 * Công thức giống app/services/pricing.py để số xem trước khớp số thật.
 */
import type { ModifierOptionRef, Product } from "@/features/catalog/api";

export interface CartLine {
  product: Product;
  quantity: number;
  /** Ghi chú cho bếp ("không hành"); "" = không ghi chú. Cùng món khác ghi chú là hai dòng riêng. */
  note: string;
  /** Lựa chọn (size, topping) — cùng món khác lựa chọn là hai dòng riêng */
  options: ModifierOptionRef[];
}

export type DiscountType = "PERCENT" | "AMOUNT";

export interface Discount {
  type: DiscountType;
  /** Chuỗi người dùng nhập: "10" (%) hoặc "20000" (đồng) */
  value: string;
}

/** Giá 1 phần = giá món + giá các lựa chọn (máy chủ tính lại y hệt). */
export const unitPrice = (line: Pick<CartLine, "product" | "options">) =>
  Math.round(Number(line.product.sale_price)) + line.options.reduce((sum, o) => sum + Math.round(Number(o.price_delta)), 0);

const price = unitPrice;

const optionKey = (options: ModifierOptionRef[]) =>
  options
    .map((o) => o.id)
    .sort((a, b) => a - b)
    .join(",");

/** Khóa của dòng giỏ hàng: sản phẩm + lựa chọn + ghi chú (giống ràng buộc ở backend). */
export const lineKey = (line: Pick<CartLine, "product" | "note" | "options">) =>
  `${line.product.id}|${optionKey(line.options)}|${line.note}`;

export function addToCart(cart: CartLine[], product: Product, quantity = 1, options: ModifierOptionRef[] = []): CartLine[] {
  // Bấm / quét thêm cộng vào dòng cùng lựa chọn và KHÔNG ghi chú; dòng có ghi chú chỉ tạo khi sửa ghi chú
  const key = lineKey({ product, options, note: "" });
  const index = cart.findIndex((l) => lineKey(l) === key);
  if (index === -1) return [...cart, { product, quantity, note: "", options }];
  // Cập nhật thông tin sản phẩm mới nhất (tồn kho, giá) khi quét lại
  return cart.map((l, i) => (i === index ? { ...l, product, quantity: l.quantity + quantity } : l));
}

export function setQuantity(cart: CartLine[], key: string, quantity: number): CartLine[] {
  if (quantity <= 0) return cart.filter((l) => lineKey(l) !== key);
  return cart.map((l) => (lineKey(l) === key ? { ...l, quantity: Math.min(quantity, 10_000) } : l));
}

/** Đổi ghi chú một dòng; nếu đã có dòng cùng món cùng ghi chú thì gộp số lượng vào dòng đó. */
export function setNote(cart: CartLine[], key: string, note: string): CartLine[] {
  const line = cart.find((l) => lineKey(l) === key);
  const normalized = note.trim().slice(0, 200);
  if (!line || normalized === line.note) return cart;
  const targetKey = lineKey({ ...line, note: normalized });
  if (cart.some((l) => lineKey(l) === targetKey)) {
    return cart
      .filter((l) => lineKey(l) !== key)
      .map((l) => (lineKey(l) === targetKey ? { ...l, quantity: Math.min(l.quantity + line.quantity, 10_000) } : l));
  }
  return cart.map((l) => (lineKey(l) === key ? { ...l, note: normalized } : l));
}

/** Tổng số lượng theo sản phẩm (một món có thể nằm ở nhiều dòng khác ghi chú) — để so với tồn kho. */
export function quantityByProduct(cart: CartLine[]): Record<number, number> {
  const totals: Record<number, number> = {};
  for (const l of cart) totals[l.product.id] = (totals[l.product.id] ?? 0) + l.quantity;
  return totals;
}

export function lineSubtotal(line: CartLine): number {
  return price(line) * line.quantity;
}

/** Làm tròn nửa lên đến đồng (ROUND_HALF_UP như backend; Math.round sai với số âm nhưng tiền giảm luôn ≥ 0). */
function roundDong(value: number): number {
  return Math.floor(value + 0.5);
}

export function discountAmount(subtotal: number, discount: Discount | null): number {
  if (!discount || discount.value.trim() === "") return 0;
  const value = Number(discount.value);
  if (!Number.isFinite(value) || value <= 0) return 0;
  const amount = discount.type === "PERCENT" ? roundDong((subtotal * value) / 100) : Math.trunc(value);
  return Math.min(amount, subtotal);
}

export function cartTotals(cart: CartLine[], discount: Discount | null) {
  const subtotal = cart.reduce((sum, l) => sum + lineSubtotal(l), 0);
  const discountValue = discountAmount(subtotal, discount);
  return {
    itemCount: cart.reduce((sum, l) => sum + l.quantity, 0),
    subtotal,
    discount: discountValue,
    total: subtotal - discountValue,
    /** % giảm thực tế — so với giới hạn của vai trò (kể cả khi giảm theo số tiền) */
    discountPercent: subtotal > 0 ? (discountValue * 100) / subtotal : 0,
  };
}

/** Gợi ý tiền khách đưa: đúng số tiền, rồi làm tròn lên các mệnh giá thường gặp. */
export function cashSuggestions(total: number): number[] {
  if (total <= 0) return [];
  const steps = [10_000, 50_000, 100_000, 200_000, 500_000];
  const values = new Set<number>([total]);
  for (const step of steps) values.add(Math.ceil(total / step) * step);
  return [...values].sort((a, b) => a - b).slice(0, 4);
}
