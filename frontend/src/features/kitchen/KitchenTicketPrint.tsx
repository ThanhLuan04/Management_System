import { createPortal } from "react-dom";

import type { Order, ServiceType } from "@/features/sales/api";
import { SERVICE_LABELS } from "@/features/sales/api";
import { formatDateTime, formatNumber } from "@/utils/format";

/** Dữ liệu tối thiểu để in phiếu bếp — dùng chung cho đơn vừa bán (POS) và phiếu trên màn hình bếp. */
export interface PrintableTicket {
  code: string;
  queue_number: number | null;
  service_type: ServiceType | null;
  table_label: string | null;
  note: string | null;
  created_at: string;
  items: { id: number; product_name: string; quantity: number; note: string | null }[];
}

export function ticketFromOrder(order: Order): PrintableTicket {
  return { ...order, items: order.items.filter((i) => i.is_dish) };
}

/**
 * Phiếu bếp khổ 80mm: số thứ tự / số bàn thật to, món + số lượng + ghi chú, KHÔNG có giá tiền.
 * Cùng cơ chế với hóa đơn (portal + @media print); chỉ hiện khi in bằng printKitchenTicket().
 */
export function KitchenTicketPrint({ ticket }: { ticket: PrintableTicket }) {
  return createPortal(
    <div className="print-root print-kitchen">
      <div className="receipt">
        <p className="receipt-center receipt-title">PHIẾU BẾP</p>
        {ticket.queue_number !== null && <p className="receipt-center receipt-big">Số {ticket.queue_number}</p>}
        <p className="receipt-center receipt-strong">
          {ticket.service_type ? SERVICE_LABELS[ticket.service_type] : ""}
          {ticket.table_label ? ` · ${ticket.table_label}` : ""}
        </p>
        <p>
          {ticket.code} · {formatDateTime(ticket.created_at)}
        </p>
        <hr />
        {ticket.items.map((item) => (
          <div key={item.id} className="receipt-line">
            <p className="receipt-item">
              {formatNumber(item.quantity)} × {item.product_name}
            </p>
            {item.note && <p className="receipt-note">→ {item.note}</p>}
          </div>
        ))}
        {ticket.note && (
          <>
            <hr />
            <p>Ghi chú: {ticket.note}</p>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** In phiếu bếp thay vì hóa đơn (cả hai cùng có trong trang; CSS chọn theo body[data-print]). */
export function printKitchenTicket() {
  document.body.dataset.print = "kitchen";
  const reset = () => {
    delete document.body.dataset.print;
    window.removeEventListener("afterprint", reset);
  };
  window.addEventListener("afterprint", reset);
  window.print();
}
