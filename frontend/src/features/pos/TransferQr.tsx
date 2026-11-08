import QRCode from "qrcode";
import { useEffect, useState } from "react";

import { bankByBin } from "@/features/system/banks";
import { formatMoney } from "@/utils/format";

import { buildVietQr } from "./vietqr";

/**
 * Mã VietQR để khách quét bằng app ngân hàng: có sẵn số tiền và nội dung chuyển khoản.
 * Vẽ dạng SVG (sắc nét, chạy được cả trong test) — tạo ngay trên trình duyệt, không gọi dịch vụ ngoài.
 */
export function TransferQr({
  bankBin,
  accountNumber,
  accountName,
  amount,
  note,
  size = 200,
}: {
  bankBin: string;
  accountNumber: string;
  accountName: string;
  amount: number;
  note: string;
  size?: number;
}) {
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    try {
      const payload = buildVietQr({ bankBin, accountNumber, amount, note });
      // Mức sửa lỗi M: chuẩn thường dùng cho VietQR, vẫn đọc được khi màn hình hơi lóa
      QRCode.toString(payload, { type: "svg", errorCorrectionLevel: "M", margin: 1 })
        .then((value) => !cancelled && (setSvg(value), setError(null)))
        .catch(() => !cancelled && setError("Không tạo được mã QR"));
    } catch (e) {
      setSvg(null);
      setError(e instanceof Error ? e.message : "Không tạo được mã QR");
    }
    return () => {
      cancelled = true;
    };
  }, [bankBin, accountNumber, amount, note]);

  const bank = bankByBin(bankBin);

  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-border bg-card p-3 text-center">
      {error ? (
        <p role="alert" className="py-8 text-sm text-destructive">
          {error}
        </p>
      ) : svg ? (
        // QR luôn đen trên nền trắng (kể cả chế độ tối) để app ngân hàng quét được
        <img
          src={`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`}
          alt={`Mã QR chuyển khoản ${formatMoney(amount)} tới ${bank?.shortName ?? bankBin} ${accountNumber}`}
          width={size}
          height={size}
          className="rounded bg-white p-1"
        />
      ) : (
        <div className="animate-pulse rounded bg-skeleton" style={{ width: size, height: size }} aria-hidden />
      )}
      <div className="space-y-0.5 text-xs">
        <p className="tabular text-base font-bold">{formatMoney(amount)}</p>
        <p className="font-medium">
          {bank?.shortName ?? `BIN ${bankBin}`} · <span className="tabular">{accountNumber}</span>
        </p>
        {accountName && <p className="text-muted uppercase">{accountName}</p>}
        <p className="text-muted">
          Nội dung: <span className="tabular font-medium text-foreground">{note}</span>
        </p>
      </div>
    </div>
  );
}
