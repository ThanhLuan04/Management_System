import { createPortal } from "react-dom";

import { formatDateTime, formatMoney, formatNumber } from "@/utils/format";

import type { Order, StoreSettings } from "./api";
import { PAYMENT_METHOD_LABELS } from "./OrderStatusBadge";

/**
 * Hóa đơn khổ 80mm. Được gắn vào <body> (portal) và chỉ hiện khi in (CSS @media print trong index.css),
 * nên gọi window.print() là in đúng hóa đơn, không in cả giao diện quản lý.
 */
export function PrintableReceipt({ order, store }: { order: Order; store?: StoreSettings }) {
  const payment = order.payments.find((p) => p.type === "PAYMENT");
  return createPortal(
    <div className="print-root">
      <div className="receipt">
        <p className="receipt-center receipt-strong">{store?.store_name || "SmartStore"}</p>
        {store?.store_address && <p className="receipt-center">{store.store_address}</p>}
        {store?.store_phone && <p className="receipt-center">ĐT: {store.store_phone}</p>}
        <p className="receipt-center receipt-title">HÓA ĐƠN BÁN HÀNG</p>
        <p>Số: {order.code}</p>
        <p>Ngày: {formatDateTime(order.created_at)}</p>
        <p>Thu ngân: {order.created_by.full_name}</p>
        {order.customer && <p>Khách: {order.customer.name}</p>}
        <hr />
        {order.items.map((item) => (
          <div key={item.id} className="receipt-line">
            <p>{item.product_name}</p>
            <p className="receipt-row">
              <span>
                {formatNumber(item.quantity)} × {formatMoney(item.unit_price)}
              </span>
              <span>{formatMoney(item.line_subtotal)}</span>
            </p>
          </div>
        ))}
        <hr />
        <p className="receipt-row"><span>Tạm tính</span><span>{formatMoney(order.subtotal)}</span></p>
        {Number(order.discount_amount) > 0 && (
          <p className="receipt-row"><span>Giảm giá</span><span>−{formatMoney(order.discount_amount)}</span></p>
        )}
        <p className="receipt-row receipt-strong"><span>TỔNG CỘNG</span><span>{formatMoney(order.total_amount)}</span></p>
        {payment && (
          <>
            <p className="receipt-row"><span>{PAYMENT_METHOD_LABELS[payment.method]}</span><span>{formatMoney(payment.cash_received ?? payment.amount)}</span></p>
            {payment.change_amount !== null && Number(payment.change_amount) > 0 && (
              <p className="receipt-row"><span>Tiền thừa</span><span>{formatMoney(payment.change_amount)}</span></p>
            )}
          </>
        )}
        {order.status === "CANCELLED" && <p className="receipt-center receipt-strong">— ĐƠN ĐÃ HỦY —</p>}
        <hr />
        <p className="receipt-center">Cảm ơn quý khách!</p>
        {store && <p className="receipt-center">Đổi trả trong {store.return_window_days} ngày kèm hóa đơn</p>}
      </div>
    </div>,
    document.body,
  );
}
