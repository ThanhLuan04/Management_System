/**
 * Giỏ hàng POS — chỉ để XEM TRƯỚC. Backend tính lại toàn bộ khi tạo đơn (không tin số tiền từ client).
 * Công thức giống app/services/pricing.py để số xem trước khớp số thật.
 */
import type { Product } from "@/features/catalog/api";

export interface CartLine {
  product: Product;
  quantity: number;
}

export type DiscountType = "PERCENT" | "AMOUNT";

export interface Discount {
  type: DiscountType;
  /** Chuỗi người dùng nhập: "10" (%) hoặc "20000" (đồng) */
  value: string;
}

const price = (line: CartLine) => Math.round(Number(line.product.sale_price));

export function addToCart(cart: CartLine[], product: Product, quantity = 1): CartLine[] {
  const index = cart.findIndex((l) => l.product.id === product.id);
  if (index === -1) return [...cart, { product, quantity }];
  // Cập nhật thông tin sản phẩm mới nhất (tồn kho, giá) khi quét lại
  return cart.map((l, i) => (i === index ? { product, quantity: l.quantity + quantity } : l));
}

export function setQuantity(cart: CartLine[], productId: number, quantity: number): CartLine[] {
  if (quantity <= 0) return cart.filter((l) => l.product.id !== productId);
  return cart.map((l) => (l.product.id === productId ? { ...l, quantity: Math.min(quantity, 10_000) } : l));
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
