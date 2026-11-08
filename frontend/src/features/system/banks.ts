/**
 * Ngân hàng / ví hỗ trợ nhận chuyển khoản qua VietQR: mã BIN theo NAPAS.
 * Nguồn: https://api.vietqr.io/v2/banks (các mục transferSupported = 1), lấy ngày 08/11/2026.
 * Thứ tự: các ngân hàng phổ biến trước.
 */
export const VIETQR_BANKS: { bin: string; shortName: string; name: string }[] = [
  { bin: "970436", shortName: "Vietcombank", name: "Ngân hàng TMCP Ngoại Thương Việt Nam" },
  { bin: "970415", shortName: "VietinBank", name: "Ngân hàng TMCP Công thương Việt Nam" },
  { bin: "970418", shortName: "BIDV", name: "Ngân hàng TMCP Đầu tư và Phát triển Việt Nam" },
  { bin: "970405", shortName: "Agribank", name: "Ngân hàng Nông nghiệp và Phát triển Nông thôn Việt Nam" },
  { bin: "970407", shortName: "Techcombank", name: "Ngân hàng TMCP Kỹ thương Việt Nam" },
  { bin: "970422", shortName: "MBBank", name: "Ngân hàng TMCP Quân đội" },
  { bin: "970416", shortName: "ACB", name: "Ngân hàng TMCP Á Châu" },
  { bin: "970432", shortName: "VPBank", name: "Ngân hàng TMCP Việt Nam Thịnh Vượng" },
  { bin: "970423", shortName: "TPBank", name: "Ngân hàng TMCP Tiên Phong" },
  { bin: "970403", shortName: "Sacombank", name: "Ngân hàng TMCP Sài Gòn Tài Lộc" },
  { bin: "970448", shortName: "OCB", name: "Ngân hàng TMCP Phương Đông" },
  { bin: "970437", shortName: "HDBank", name: "Ngân hàng TMCP Phát triển Thành phố Hồ Chí Minh" },
  { bin: "970454", shortName: "VietCapitalBank", name: "Ngân hàng TMCP Bản Việt" },
  { bin: "970429", shortName: "SCB", name: "Ngân hàng TMCP Sài Gòn" },
  { bin: "970441", shortName: "VIB", name: "Ngân hàng TMCP Quốc tế Việt Nam" },
  { bin: "970443", shortName: "SHB", name: "Ngân hàng TMCP Sài Gòn - Hà Nội" },
  { bin: "970431", shortName: "Eximbank", name: "Ngân hàng TMCP Xuất Nhập khẩu Việt Nam" },
  { bin: "970426", shortName: "MSB", name: "Ngân hàng TMCP Hàng Hải" },
  { bin: "546034", shortName: "CAKE", name: "Ngân hàng số CAKE by VPBank" },
  { bin: "546035", shortName: "Ubank", name: "Ngân hàng số Ubank by VPBank" },
  { bin: "963388", shortName: "Timo", name: "Ngân hàng số Timo by Ban Viet Bank" },
  { bin: "970400", shortName: "SaigonBank", name: "Ngân hàng TMCP Sài Gòn Công Thương" },
  { bin: "970409", shortName: "BacABank", name: "Ngân hàng TMCP Bắc Á" },
  { bin: "971133", shortName: "PVcomBank Pay", name: "Ngân hàng số PVcomBank" },
  { bin: "970412", shortName: "PVcomBank", name: "Ngân hàng TMCP Đại Chúng Việt Nam" },
  { bin: "970414", shortName: "MBV", name: "Ngân hàng TNHH MTV Việt Nam Hiện Đại" },
  { bin: "970419", shortName: "NCB", name: "Ngân hàng TMCP Quốc Dân" },
  { bin: "970424", shortName: "ShinhanBank", name: "Ngân hàng TNHH MTV Shinhan Việt Nam" },
  { bin: "970425", shortName: "ABBANK", name: "Ngân hàng TMCP An Bình" },
  { bin: "970427", shortName: "VietABank", name: "Ngân hàng TMCP Việt Á" },
  { bin: "970428", shortName: "NamABank", name: "Ngân hàng TMCP Nam Á" },
  { bin: "970430", shortName: "PGBank", name: "Ngân hàng TMCP Thịnh vượng và Phát triển" },
  { bin: "970433", shortName: "VietBank", name: "Ngân hàng TMCP Việt Nam Thương Tín" },
  { bin: "970438", shortName: "BaoVietBank", name: "Ngân hàng TMCP Bảo Việt" },
  { bin: "970440", shortName: "SeABank", name: "Ngân hàng TMCP Đông Nam Á" },
  { bin: "970446", shortName: "COOPBANK", name: "Ngân hàng Hợp tác xã Việt Nam" },
  { bin: "970449", shortName: "LPBank", name: "Ngân hàng TMCP Lộc Phát Việt Nam" },
  { bin: "970452", shortName: "KienLongBank", name: "Ngân hàng TMCP Kiên Long" },
  { bin: "668888", shortName: "KBank", name: "Ngân hàng Đại chúng TNHH Kasikornbank" },
  { bin: "970434", shortName: "IndovinaBank", name: "Ngân hàng TNHH Indovina" },
  { bin: "422589", shortName: "CIMB", name: "Ngân hàng TNHH MTV CIMB Việt Nam" },
  { bin: "970444", shortName: "CBBank", name: "Ngân hàng TM TNHH MTV Ngoại thương Công nghệ số (Vietcombank Neo)" },
  { bin: "970457", shortName: "Woori", name: "Ngân hàng TNHH MTV Woori Việt Nam" },
  { bin: "970462", shortName: "KookminHN", name: "Ngân hàng Kookmin - Chi nhánh Hà Nội" },
  { bin: "970463", shortName: "KookminHCM", name: "Ngân hàng Kookmin - Chi nhánh Thành phố Hồ Chí Minh" },
  { bin: "971025", shortName: "MoMo", name: "Ví MoMo (CTCP Dịch Vụ Di Động Trực Tuyến)" },
  { bin: "971101", shortName: "ZaloPay", name: "Ví điện tử ZaloPay" },
  { bin: "971032", shortName: "MVAS", name: "Trung tâm Dịch vụ số Mobifone" },
];

export function bankByBin(bin: string) {
  return VIETQR_BANKS.find((b) => b.bin === bin);
}
