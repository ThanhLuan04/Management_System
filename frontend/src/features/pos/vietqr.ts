/**
 * Tạo nội dung mã VietQR (chuẩn NAPAS, dựa trên EMVCo Merchant-Presented QR) để khách quét chuyển khoản.
 * Tạo ngay trên trình duyệt — không gửi số tài khoản / số tiền cho dịch vụ bên ngoài.
 *
 * Cấu trúc (mỗi trường = ID 2 số + độ dài 2 số + giá trị):
 *   00 "01"                      phiên bản
 *   01 "12"                      QR động (có số tiền, dùng một lần)
 *   38 { 00 "A000000727"         định danh NAPAS
 *        01 { 00 BIN, 01 số TK } người thụ hưởng
 *        02 "QRIBFTTA" }         dịch vụ: chuyển nhanh tới tài khoản
 *   53 "704"                     tiền tệ VND
 *   54 số tiền                   số nguyên đồng
 *   58 "VN"
 *   62 { 08 nội dung CK }
 *   63 CRC-16/CCITT-FALSE (4 ký tự hex in hoa) tính trên toàn bộ chuỗi kể cả "6304"
 */

function field(id: string, value: string): string {
  if (value.length > 99) throw new Error(`Trường ${id} dài quá 99 ký tự`);
  return `${id}${String(value.length).padStart(2, "0")}${value}`;
}

/** CRC-16/CCITT-FALSE: đa thức 0x1021, giá trị đầu 0xFFFF, không đảo bit. Chuẩn kiểm tra: "123456789" → 29B1. */
export function crc16(input: string): string {
  let crc = 0xffff;
  for (const byte of new TextEncoder().encode(input)) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/** Nội dung chuyển khoản: chỉ chữ không dấu, số, khoảng trắng (app ngân hàng hay loại bỏ ký tự khác), tối đa 25. */
export function sanitizeTransferNote(note: string): string {
  return note
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[đĐ]/g, (c) => (c === "đ" ? "d" : "D"))
    .replace(/[^A-Za-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 25);
}

export interface VietQrInput {
  bankBin: string; // 6 số, vd. 970436
  accountNumber: string;
  amount: number; // đồng, số nguyên > 0
  note: string;
}

export function buildVietQr({ bankBin, accountNumber, amount, note }: VietQrInput): string {
  if (!/^\d{6}$/.test(bankBin)) throw new Error("Mã BIN ngân hàng phải gồm 6 chữ số");
  if (!/^[0-9A-Za-z]{1,19}$/.test(accountNumber)) throw new Error("Số tài khoản không hợp lệ");
  if (!Number.isInteger(amount) || amount <= 0) throw new Error("Số tiền phải là số nguyên dương");

  const beneficiary = field("00", bankBin) + field("01", accountNumber);
  const merchantAccount = field("00", "A000000727") + field("01", beneficiary) + field("02", "QRIBFTTA");
  const cleanNote = sanitizeTransferNote(note);
  const payload =
    field("00", "01") +
    field("01", "12") +
    field("38", merchantAccount) +
    field("53", "704") +
    field("54", String(amount)) +
    field("58", "VN") +
    (cleanNote ? field("62", field("08", cleanNote)) : "") +
    "6304";
  return payload + crc16(payload);
}

/** Mã đối soát ngắn cho mỗi giỏ hàng, vd. "SS7K2M9Q" — in trên QR để tra sao kê ngân hàng khớp với đơn. */
export function transferReference(seed: string): string {
  const digits = seed.replace(/[^0-9a-f]/gi, "").slice(0, 10);
  return `SS${parseInt(digits || "0", 16).toString(36).toUpperCase().padStart(6, "0").slice(-6)}`;
}
