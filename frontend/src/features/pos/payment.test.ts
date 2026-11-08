import { describe, expect, it } from "vitest";

import { buildPayment, emptySplit, type PaymentState } from "./payment";

const base: PaymentState = { mode: "CASH", cash: "", reference: "", split: emptySplit(), transferConfirmed: false };
const state = (change: Partial<PaymentState>): PaymentState => ({ ...base, ...change });
const REF = "SS7K2M9Q";

describe("buildPayment — một phương thức", () => {
  it("cash needs enough money", () => {
    expect(buildPayment(state({ cash: "" }), 57000, null)).toEqual({ ok: false, errors: { cash: "Nhập số tiền khách đưa" } });
    expect(buildPayment(state({ cash: "50000" }), 57000, null)).toEqual({ ok: false, errors: { cash: "Tiền khách đưa chưa đủ" } });
    expect(buildPayment(state({ cash: "100000" }), 57000, null)).toEqual({
      ok: true,
      payload: { payment: { method: "CASH", cash_received: "100000" } },
    });
  });

  it("transfer with QR must be confirmed and carries the QR reference", () => {
    expect(buildPayment(state({ mode: "BANK_TRANSFER" }), 57000, REF)).toMatchObject({ ok: false, errors: { transfer: expect.any(String) } });
    expect(buildPayment(state({ mode: "BANK_TRANSFER", transferConfirmed: true }), 57000, REF)).toEqual({
      ok: true,
      payload: { payment: { method: "BANK_TRANSFER", reference_note: REF } },
    });
  });

  it("transfer without bank setup (no QR) works like before, no confirmation step", () => {
    expect(buildPayment(state({ mode: "BANK_TRANSFER", reference: "FT2611" }), 57000, null)).toEqual({
      ok: true,
      payload: { payment: { method: "BANK_TRANSFER", reference_note: "FT2611" } },
    });
  });

  it("card sends the optional reference", () => {
    expect(buildPayment(state({ mode: "CARD", reference: " " }), 57000, REF)).toEqual({
      ok: true,
      payload: { payment: { method: "CARD", reference_note: null } },
    });
  });
});

describe("buildPayment — kết hợp", () => {
  const split = (cash: string, transfer: string, card = "") => ({ CASH: cash, BANK_TRANSFER: transfer, CARD: card });

  it("parts must add up exactly to the total", () => {
    expect(buildPayment(state({ mode: "MIXED", split: split("20000", "30000") }), 57000, null)).toEqual({
      ok: false,
      errors: { split: expect.stringMatching(/Còn thiếu 7\.000/) },
    });
    expect(buildPayment(state({ mode: "MIXED", split: split("20000", "40000") }), 57000, null)).toEqual({
      ok: false,
      errors: { split: expect.stringMatching(/Chia thừa 3\.000/) },
    });
  });

  it("sends each non-zero part with the QR reference on the transfer part", () => {
    expect(
      buildPayment(state({ mode: "MIXED", split: split("7000", "50000"), transferConfirmed: true }), 57000, REF),
    ).toEqual({
      ok: true,
      payload: {
        payments: [
          { method: "CASH", amount: "7000" },
          { method: "BANK_TRANSFER", amount: "50000", reference_note: REF },
        ],
      },
    });
  });

  it("requires confirmation only when a transfer part exists", () => {
    expect(buildPayment(state({ mode: "MIXED", split: split("7000", "50000") }), 57000, REF).ok).toBe(false);
    expect(buildPayment(state({ mode: "MIXED", split: split("7000", "", "50000") }), 57000, REF)).toEqual({
      ok: true,
      payload: { payments: [{ method: "CASH", amount: "7000" }, { method: "CARD", amount: "50000", reference_note: null }] },
    });
  });

  it("falls back to a single payment when only one part is filled", () => {
    expect(buildPayment(state({ mode: "MIXED", split: split("57000", "") }), 57000, REF)).toEqual({
      ok: true,
      payload: { payment: { method: "CASH", cash_received: "57000" } },
    });
  });
});
