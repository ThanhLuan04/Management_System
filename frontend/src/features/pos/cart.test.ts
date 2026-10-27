import { describe, expect, it } from "vitest";

import type { Product } from "@/features/catalog/api";

import { addToCart, cartTotals, cashSuggestions, discountAmount, setQuantity } from "./cart";

const product = (id: number, price: string, quantity = 50) => ({ id, sale_price: price, quantity }) as Product;
const milk = product(1, "32000.00");
const cake = product(2, "10000.00");

describe("cart lines", () => {
  it("adds a new line or increases the quantity of an existing one", () => {
    let cart = addToCart([], milk);
    cart = addToCart(cart, cake, 2);
    cart = addToCart(cart, milk, 4);

    expect(cart.map((l) => [l.product.id, l.quantity])).toEqual([
      [1, 5],
      [2, 2],
    ]);
  });

  it("removes a line when the quantity drops to zero", () => {
    const cart = setQuantity(addToCart([], milk), milk.id, 0);
    expect(cart).toEqual([]);
  });
});

describe("totals mirror the backend formula", () => {
  it("matches the API doc example: 5 milk + 2 cake, 10% off", () => {
    const cart = addToCart(addToCart([], milk, 5), cake, 2);

    expect(cartTotals(cart, { type: "PERCENT", value: "10" })).toMatchObject({
      itemCount: 7,
      subtotal: 180_000,
      discount: 18_000,
      total: 162_000,
      discountPercent: 10,
    });
  });

  it.each([
    [33_333, "PERCENT", "10", 3_333], // 3.333,3 → 3.333
    [33_335, "PERCENT", "10", 3_334], // 3.333,5 → làm tròn lên như backend
    [50_000, "AMOUNT", "80000", 50_000], // không vượt tạm tính
    [50_000, "AMOUNT", "", 0],
    [50_000, "PERCENT", "-5", 0],
  ] as const)("subtotal %d, %s %s → %d", (subtotal, type, value, expected) => {
    expect(discountAmount(subtotal, { type, value })).toBe(expected);
  });

  it("reports the effective percent of an amount discount (checked against the role limit)", () => {
    const cart = addToCart([], milk, 5); // 160.000
    expect(cartTotals(cart, { type: "AMOUNT", value: "16001" }).discountPercent).toBeGreaterThan(10);
  });
});

describe("cashSuggestions", () => {
  it("offers the exact amount and rounded-up banknotes", () => {
    expect(cashSuggestions(162_000)).toEqual([162_000, 170_000, 200_000, 500_000]);
    expect(cashSuggestions(50_000)).toEqual([50_000, 100_000, 200_000, 500_000]);
    expect(cashSuggestions(0)).toEqual([]);
  });
});
