import { describe, expect, it } from "vitest";

import { buildVietQr, crc16, sanitizeTransferNote, transferReference } from "./vietqr";

/** Tách chuỗi TLV (ID 2 số + độ dài 2 số + giá trị) để kiểm tra từng trường một cách độc lập. */
function parseTlv(input: string): Record<string, string> {
  const fields: Record<string, string> = {};
  let i = 0;
  while (i < input.length) {
    const id = input.slice(i, i + 2);
    const length = Number(input.slice(i + 2, i + 4));
    fields[id] = input.slice(i + 4, i + 4 + length);
    i += 4 + length;
  }
  return fields;
}

const sample = { bankBin: "970436", accountNumber: "0011001234567", amount: 57000, note: "SS7K2M9Q" };

describe("crc16 (CRC-16/CCITT-FALSE)", () => {
  it("matches the standard check value", () => {
    expect(crc16("123456789")).toBe("29B1");
  });
});

describe("buildVietQr", () => {
  it("encodes every VietQR field with correct lengths", () => {
    const fields = parseTlv(buildVietQr(sample));

    expect(fields["00"]).toBe("01");
    expect(fields["01"]).toBe("12"); // QR động: có số tiền
    expect(fields["53"]).toBe("704");
    expect(fields["54"]).toBe("57000");
    expect(fields["58"]).toBe("VN");
    expect(parseTlv(fields["62"])["08"]).toBe("SS7K2M9Q");

    const account = parseTlv(fields["38"]);
    expect(account["00"]).toBe("A000000727");
    expect(account["02"]).toBe("QRIBFTTA");
    expect(parseTlv(account["01"])).toEqual({ "00": "970436", "01": "0011001234567" });
  });

  it("ends with a CRC computed over the whole payload including the 6304 tag", () => {
    const qr = buildVietQr(sample);
    expect(qr.slice(-8, -4)).toBe("6304");
    expect(qr.slice(-4)).toBe(crc16(qr.slice(0, -4)));
  });

  it("starts with the well-known VietQR prefix", () => {
    // 38 = 57 ký tự khi số tài khoản dài 13 (ví dụ phổ biến trong tài liệu VietQR)
    expect(buildVietQr(sample).startsWith("00020101021238570010A000000727")).toBe(true);
  });

  it("omits the note field when the note is empty after cleaning", () => {
    expect(parseTlv(buildVietQr({ ...sample, note: "!!!" }))["62"]).toBeUndefined();
  });

  it.each([
    [{ bankBin: "97043" }, "BIN"],
    [{ accountNumber: "0123-456" }, "tài khoản"],
    [{ amount: 0 }, "Số tiền"],
    [{ amount: 1500.5 }, "Số tiền"],
  ])("rejects invalid input %o", (change, message) => {
    expect(() => buildVietQr({ ...sample, ...change })).toThrow(message);
  });
});

describe("sanitizeTransferNote", () => {
  it("removes Vietnamese accents and symbols that bank apps strip", () => {
    expect(sanitizeTransferNote("Thanh toán đơn #HD-0001!")).toBe("Thanh toan don HD0001");
  });

  it("limits the note to 25 characters", () => {
    expect(sanitizeTransferNote("A".repeat(40))).toHaveLength(25);
  });
});

describe("transferReference", () => {
  it("is short, upper-case and stable for the same cart", () => {
    const key = "3f2a9c1e-77b0-4d8e-9a51-0c2b7e4f1d23";
    expect(transferReference(key)).toMatch(/^SS[0-9A-Z]{6}$/);
    expect(transferReference(key)).toBe(transferReference(key));
    expect(transferReference("aaaaaaaa-0000")).not.toBe(transferReference(key));
  });
});
