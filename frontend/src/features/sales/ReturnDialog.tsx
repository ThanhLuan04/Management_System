import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { FormField, Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { toApiError } from "@/services/apiError";
import { formatMoney, formatNumber } from "@/utils/format";

import { newIdempotencyKey, type Order, useCreateReturn } from "./api";
import { estimateRefund } from "./refund";

type Condition = "RESELLABLE" | "DAMAGED";

export function ReturnDialog({ order, open, onOpenChange }: { order: Order; open: boolean; onOpenChange: (o: boolean) => void }) {
  const create = useCreateReturn(order.id);
  const returnable = order.items.filter((i) => i.returnable_quantity > 0);
  const [quantities, setQuantities] = useState<Record<number, string>>({});
  const [conditions, setConditions] = useState<Record<number, Condition>>({});
  const [reason, setReason] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const key = useRef(newIdempotencyKey());

  useEffect(() => {
    if (open) {
      setQuantities({});
      setConditions({});
      setReason("");
      setSubmitted(false);
      key.current = newIdempotencyKey(); // mỗi lần mở hộp thoại là một phiếu trả mới
    }
  }, [open]);

  const lines = returnable
    .map((item) => ({ item, quantity: Number(quantities[item.id] || 0), condition: conditions[item.id] ?? "RESELLABLE" }))
    .filter((l) => l.quantity > 0);
  const lineErrors = Object.fromEntries(
    returnable
      .filter((item) => Number(quantities[item.id] || 0) > item.returnable_quantity)
      .map((item) => [item.id, `Tối đa ${item.returnable_quantity}`]),
  );
  const estimated = lines.reduce((sum, l) => sum + estimateRefund(l.item, l.quantity), 0);
  const reasonError = reason.trim().length < 3 ? "Lý do tối thiểu 3 ký tự" : undefined;

  const submit = () => {
    setSubmitted(true);
    if (lines.length === 0 || reasonError || Object.keys(lineErrors).length) return;
    create.mutate(
      {
        idempotencyKey: key.current,
        payload: {
          reason: reason.trim(),
          items: lines.map((l) => ({ order_item_id: l.item.id, quantity: l.quantity, condition: l.condition })),
        },
      },
      {
        onSuccess: (result) => {
          toast.success(`Đã tạo phiếu trả ${result.code} — hoàn ${formatMoney(result.total_refund)}`);
          onOpenChange(false);
        },
        onError: (error) => toast.error(toApiError(error).message),
      },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !create.isPending && onOpenChange(o)}
      title={`Trả hàng — đơn ${order.code}`}
      description="Tiền hoàn tính theo giá sau giảm giá. Hàng còn bán được sẽ nhập lại kho; hàng hỏng thì không."
      className="max-w-2xl"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={create.isPending}>
            Hủy
          </Button>
          <Button onClick={submit} loading={create.isPending}>
            Xác nhận trả hàng
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="text-left text-muted">
              <tr className="border-b border-border">
                <th className="py-2 pr-2 font-medium">Sản phẩm</th>
                <th className="px-2 py-2 text-right font-medium">Còn trả được</th>
                <th className="w-24 px-2 py-2 text-right font-medium">SL trả</th>
                <th className="w-40 px-2 py-2 font-medium">Tình trạng</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {returnable.map((item) => (
                <tr key={item.id} className="align-top">
                  <td className="py-2 pr-2">
                    {item.product_name}
                    <span className="tabular block text-xs text-muted">{formatMoney(estimateRefund(item, 1))}/sp sau giảm</span>
                  </td>
                  <td className="tabular px-2 py-2 text-right">{formatNumber(item.returnable_quantity)}</td>
                  <td className="px-2 py-1.5">
                    <Input
                      aria-label={`Số lượng trả ${item.product_name}`}
                      inputMode="numeric"
                      className="text-right tabular"
                      value={quantities[item.id] ?? ""}
                      invalid={!!lineErrors[item.id]}
                      onChange={(e) => setQuantities((q) => ({ ...q, [item.id]: e.target.value.replace(/\D/g, "").slice(0, 5) }))}
                    />
                    {lineErrors[item.id] && <p className="text-right text-xs text-destructive">{lineErrors[item.id]}</p>}
                  </td>
                  <td className="px-2 py-1.5">
                    <Select
                      aria-label={`Tình trạng ${item.product_name}`}
                      value={conditions[item.id] ?? "RESELLABLE"}
                      onChange={(e) => setConditions((c) => ({ ...c, [item.id]: e.target.value as Condition }))}
                    >
                      <option value="RESELLABLE">Còn bán được</option>
                      <option value="DAMAGED">Hỏng</option>
                    </Select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {submitted && lines.length === 0 && <p className="text-sm text-destructive">Nhập số lượng trả cho ít nhất một sản phẩm.</p>}
        <FormField label="Lý do trả hàng" htmlFor="return-reason" required error={submitted ? reasonError : undefined}>
          <Input id="return-reason" value={reason} maxLength={255} invalid={submitted && !!reasonError} onChange={(e) => setReason(e.target.value)} />
        </FormField>
        <p className="flex justify-between border-t border-border pt-3 text-sm">
          <span className="text-muted">Tiền hoàn dự kiến</span>
          <span className="tabular text-lg font-bold">{formatMoney(estimated)}</span>
        </p>
      </div>
    </Dialog>
  );
}
