import { Ban, Printer, Undo2 } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { ErrorState, PageHeader } from "@/components/common/States";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { FormField, Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Spinner";
import { useAuth } from "@/features/auth/AuthProvider";
import { P } from "@/features/auth/permissions";
import { toApiError } from "@/services/apiError";
import { formatDate, formatDateTime, formatMoney, formatNumber, vnToday } from "@/utils/format";

import { useCancelOrder, useOrder, useStoreSettings } from "./api";
import { OrderStatusBadge, PAYMENT_METHOD_LABELS } from "./OrderStatusBadge";
import { PrintableReceipt } from "./Receipt";
import { ReturnDialog } from "./ReturnDialog";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

export function OrderDetailPage() {
  const orderId = Number(useParams().id);
  const { can } = useAuth();
  const order = useOrder(orderId);
  const store = useStoreSettings();
  const cancel = useCancelOrder(orderId);
  const [returning, setReturning] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelTried, setCancelTried] = useState(false);

  if (order.error) return <ErrorState error={order.error} onRetry={() => order.refetch()} />;
  if (order.isPending) return <Skeleton className="h-96" />;
  const o = order.data;

  const completed = o.status === "COMPLETED";
  const canReturn = completed && can(P.RETURNS_CREATE) && o.items.some((i) => i.returnable_quantity > 0);
  // Quy tắc hủy (backend kiểm tra lại): chỉ trong ngày bán (giờ VN) và chưa có phiếu trả
  const sameDay = formatDate(o.created_at) === formatDate(vnToday());
  const cancelBlocked = !completed ? null : o.returns.length > 0 ? "Đơn đã có phiếu trả — hãy dùng trả hàng" : !sameDay ? "Chỉ hủy được trong ngày bán — hãy dùng trả hàng" : null;

  const submitCancel = () =>
    cancel.mutate(cancelReason.trim(), {
      onSuccess: () => {
        toast.success("Đã hủy đơn, hoàn tiền và hoàn hàng về kho");
        setCancelling(false);
      },
      onError: (error) => toast.error(toApiError(error).message),
    });

  return (
    <>
      <PageHeader
        title={`Đơn hàng ${o.code}`}
        description={formatDateTime(o.created_at)}
        actions={
          <>
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="h-4 w-4" aria-hidden /> In hóa đơn
            </Button>
            {canReturn && (
              <Button variant="outline" onClick={() => setReturning(true)}>
                <Undo2 className="h-4 w-4" aria-hidden /> Trả hàng
              </Button>
            )}
            {completed && can(P.ORDERS_CANCEL) && (
              <Button variant="destructive" disabled={!!cancelBlocked} title={cancelBlocked ?? undefined} onClick={() => setCancelling(true)}>
                <Ban className="h-4 w-4" aria-hidden /> Hủy đơn
              </Button>
            )}
          </>
        }
      />
      {completed && can(P.ORDERS_CANCEL) && cancelBlocked && <p className="-mt-4 mb-4 text-right text-xs text-muted">{cancelBlocked}</p>}

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6">
          <Card>
            <CardContent>
              <dl className="space-y-2.5 text-sm">
                <Row label="Trạng thái"><OrderStatusBadge order={o} /></Row>
                <Row label="Khách hàng">
                  {o.customer ? <Link to={`/customers/${o.customer.id}`} className="text-primary hover:underline">{o.customer.name}</Link> : "Khách lẻ"}
                </Row>
                <Row label="Thu ngân">{o.created_by.full_name}</Row>
                {o.note && <Row label="Ghi chú">{o.note}</Row>}
                {o.cancelled_at && (
                  <>
                    <Row label="Hủy lúc"><span className="tabular">{formatDateTime(o.cancelled_at)}</span></Row>
                    <Row label="Người hủy">{o.cancelled_by?.full_name}</Row>
                    <Row label="Lý do hủy">{o.cancel_reason}</Row>
                  </>
                )}
              </dl>
            </CardContent>
          </Card>
          <Card>
            <CardHeader title="Thanh toán" />
            <CardContent>
              <dl className="tabular space-y-2 text-sm">
                <Row label="Tạm tính">{formatMoney(o.subtotal)}</Row>
                {Number(o.discount_amount) > 0 && (
                  <Row label={`Giảm giá${o.discount_type === "PERCENT" ? ` (${Number(o.discount_value)}%)` : ""}`}>−{formatMoney(o.discount_amount)}</Row>
                )}
                <div className="flex justify-between border-t border-border pt-2 text-base font-semibold">
                  <dt>Tổng tiền</dt>
                  <dd>{formatMoney(o.total_amount)}</dd>
                </div>
                {o.gross_profit !== undefined && <Row label="Lợi nhuận gộp (sau hoàn trả)">{formatMoney(o.gross_profit)}</Row>}
              </dl>
              <ul className="mt-4 space-y-2 border-t border-border pt-3 text-sm">
                {o.payments.map((p) => (
                  <li key={p.id} className="flex justify-between gap-3">
                    <span>
                      {p.type === "PAYMENT" ? "Thu" : "Hoàn"} · {PAYMENT_METHOD_LABELS[p.method]}
                      {p.cash_received && (
                        <span className="block text-xs text-muted">
                          Khách đưa {formatMoney(p.cash_received)} · thừa {formatMoney(p.change_amount)}
                        </span>
                      )}
                      {p.reference_note && <span className="block text-xs text-muted">Mã GD: {p.reference_note}</span>}
                    </span>
                    <span className={p.type === "REFUND" ? "tabular text-destructive-strong" : "tabular"}>
                      {p.type === "REFUND" ? "−" : ""}
                      {formatMoney(p.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6 xl:col-span-2">
          <Card>
            <CardHeader title="Sản phẩm" description={`${o.items.length} mặt hàng`} />
            <CardContent className="overflow-x-auto px-0">
              <table className="w-full text-sm">
                <thead className="text-left text-muted">
                  <tr className="border-b border-border">
                    <th className="px-5 py-2 font-medium">Sản phẩm</th>
                    <th className="px-3 py-2 text-right font-medium">SL</th>
                    <th className="px-3 py-2 text-right font-medium">Đơn giá</th>
                    <th className="px-3 py-2 text-right font-medium">Giảm (phân bổ)</th>
                    <th className="px-3 py-2 text-right font-medium">Thành tiền</th>
                    <th className="px-5 py-2 text-right font-medium">Đã trả</th>
                  </tr>
                </thead>
                <tbody className="tabular divide-y divide-border">
                  {o.items.map((i) => (
                    <tr key={i.id}>
                      <td className="px-5 py-2.5 font-sans">
                        <Link to={`/products/${i.product_id}`} className="hover:text-primary hover:underline">
                          {i.product_name}
                        </Link>
                        <span className="block text-xs text-muted">
                          {i.sku}
                          {i.unit_cost !== undefined && ` · giá vốn ${formatMoney(i.unit_cost)}`}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right">{formatNumber(i.quantity)}</td>
                      <td className="px-3 py-2.5 text-right">{formatMoney(i.unit_price)}</td>
                      <td className="px-3 py-2.5 text-right">{Number(i.discount_allocated) > 0 ? `−${formatMoney(i.discount_allocated)}` : "—"}</td>
                      <td className="px-3 py-2.5 text-right font-medium">{formatMoney(i.line_total)}</td>
                      <td className="px-5 py-2.5 text-right">{i.returned_quantity > 0 ? formatNumber(i.returned_quantity) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          {o.returns.length > 0 && (
            <Card>
              <CardHeader title="Phiếu trả hàng" />
              <CardContent className="px-0">
                <ul className="divide-y divide-border text-sm">
                  {o.returns.map((r) => (
                    <li key={r.id} className="flex justify-between gap-3 px-5 py-2.5">
                      <Link to={`/returns/${r.id}`} className="tabular font-medium text-primary hover:underline">
                        {r.code}
                      </Link>
                      <span className="tabular text-muted">{formatDateTime(r.created_at)}</span>
                      <span className="tabular text-destructive-strong">−{formatMoney(r.total_refund)}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <ReturnDialog order={o} open={returning} onOpenChange={setReturning} />
      <ConfirmDialog
        open={cancelling}
        onOpenChange={setCancelling}
        title={`Hủy đơn ${o.code}?`}
        description={`Toàn bộ ${formatNumber(o.items.reduce((s, i) => s + i.quantity, 0))} sản phẩm sẽ được hoàn về kho và hoàn ${formatMoney(o.total_amount)} cho khách. Không thể hoàn tác.`}
        confirmLabel="Hủy đơn"
        destructive
        loading={cancel.isPending}
        onConfirm={() => {
          setCancelTried(true);
          if (cancelReason.trim().length >= 3) submitCancel();
        }}
      >
        <FormField
          label="Lý do hủy"
          htmlFor="cancel-reason"
          required
          error={cancelTried && cancelReason.trim().length < 3 ? "Lý do tối thiểu 3 ký tự" : undefined}
        >
          <Input id="cancel-reason" value={cancelReason} maxLength={255} onChange={(e) => setCancelReason(e.target.value)} autoFocus />
        </FormField>
      </ConfirmDialog>
      <PrintableReceipt order={o} store={store.data} />
    </>
  );
}
