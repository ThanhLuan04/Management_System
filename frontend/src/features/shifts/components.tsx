import { useQueryClient } from "@tanstack/react-query";
import { LockOpen } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Dialog } from "@/components/ui/Dialog";
import { FormField, Input } from "@/components/ui/Input";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { PAYMENT_METHOD_LABELS } from "@/features/sales/OrderStatusBadge";
import { toApiError } from "@/services/apiError";
import { cn } from "@/utils/cn";
import { formatDateTime, formatMoney, formatNumber, toNumber } from "@/utils/format";

import { type Shift, useCloseShift, useOpenShift } from "./api";

/** Chênh lệch khi đóng ca: 0 = khớp (xanh), âm = thiếu tiền (đỏ), dương = thừa tiền (vàng). Luôn kèm chữ, không chỉ dựa vào màu. */
export function DifferenceBadge({ value }: { value: string | number | null }) {
  if (value === null) return <Badge variant="info">Đang mở</Badge>;
  const n = toNumber(value);
  if (n === 0) return <Badge variant="success">Khớp</Badge>;
  return n < 0 ? (
    <Badge variant="destructive">Thiếu {formatMoney(-n)}</Badge>
  ) : (
    <Badge variant="warning">Thừa {formatMoney(n)}</Badge>
  );
}

/** Màn hình bán hàng khi chưa có ca: nhập tiền đầu ca (gợi ý = tiền đếm lúc đóng ca trước) rồi mở ca. */
export function OpenShiftCard({ suggested }: { suggested: string }) {
  const queryClient = useQueryClient();
  const open = useOpenShift();
  const [cash, setCash] = useState(String(Math.round(toNumber(suggested))));

  const submit = () =>
    open.mutate(cash || "0", {
      onSuccess: (shift) => toast.success(`Đã mở ca ${shift.code}`),
      onError: (error) => {
        const apiError = toApiError(error);
        // Người khác vừa mở ca ở máy khác (két chung) → tải lại để vào bán luôn
        if (apiError.code === "SHIFT_ALREADY_OPEN") queryClient.invalidateQueries({ queryKey: ["shifts"] });
        toast.error(apiError.message);
      },
    });

  return (
    <Card className="mx-auto max-w-md">
      <CardContent className="space-y-4 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-primary">
          <LockOpen className="h-6 w-6" aria-hidden />
        </span>
        <div>
          <h2 className="text-lg font-semibold">Chưa mở ca</h2>
          <p className="mt-1 text-sm text-muted">Đếm tiền lẻ có sẵn trong két rồi mở ca để bắt đầu bán hàng.</p>
        </div>
        <form
          className="space-y-4 text-left"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <FormField label="Tiền đầu ca" htmlFor="opening-cash" hint="Gợi ý: số tiền đếm được lúc đóng ca trước">
            <MoneyInput id="opening-cash" value={cash} onChange={setCash} autoFocus />
          </FormField>
          <Button type="submit" size="lg" className="w-full" loading={open.isPending}>
            Mở ca
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={cn("flex justify-between gap-4", strong && "border-t border-border pt-2 text-base font-semibold")}>
      <dt className={strong ? undefined : "text-muted"}>{label}</dt>
      <dd className="tabular">{value}</dd>
    </div>
  );
}

/** Tiền mặt của ca + tiền theo phương thức + doanh số từng thu ngân (két chung). */
export function ShiftSummary({ shift }: { shift: Shift }) {
  return (
    <div className="space-y-4 text-sm">
      <dl className="space-y-1.5" aria-label="Tiền mặt trong ca">
        <Row label="Tiền đầu ca" value={formatMoney(shift.opening_cash)} />
        <Row label="+ Thu tiền mặt" value={formatMoney(shift.cash_received)} />
        <Row label="− Hoàn tiền mặt" value={formatMoney(shift.cash_refunded)} />
        <Row label="Tiền mặt phải có" value={formatMoney(shift.current_expected_cash)} strong />
      </dl>
      {shift.received_by_method.length > 0 && (
        <div>
          <p className="mb-1 font-medium">Đã thu theo phương thức</p>
          <dl className="space-y-1">
            {shift.received_by_method.map((m) => (
              <Row key={m.method} label={PAYMENT_METHOD_LABELS[m.method] ?? m.method} value={formatMoney(m.amount)} />
            ))}
          </dl>
        </div>
      )}
      <div>
        <p className="mb-1 font-medium">Doanh số theo thu ngân ({formatNumber(shift.order_count)} đơn)</p>
        {shift.by_cashier.length === 0 ? (
          <p className="text-muted">Chưa có đơn nào trong ca.</p>
        ) : (
          <dl className="space-y-1">
            {shift.by_cashier.map((c) => (
              <Row key={c.user.id} label={`${c.user.full_name} · ${formatNumber(c.order_count)} đơn`} value={formatMoney(c.revenue)} />
            ))}
          </dl>
        )}
      </div>
    </div>
  );
}

/** Đóng ca: đếm két, nhập số tiền thực tế; lệch thì bắt buộc ghi lý do. */
export function CloseShiftDialog({ shift, open, onOpenChange }: { shift: Shift; open: boolean; onOpenChange: (o: boolean) => void }) {
  const close = useCloseShift();
  const [counted, setCounted] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setCounted("");
      setNote("");
      setError(null);
    }
  }, [open]);

  const difference = counted === "" ? null : toNumber(counted) - toNumber(shift.current_expected_cash);
  const needsNote = difference !== null && difference !== 0;

  const submit = () => {
    if (counted === "") return setError("Nhập số tiền đếm được trong két");
    if (needsNote && !note.trim()) return setError("Tiền đếm được bị lệch — hãy ghi lý do chênh lệch");
    setError(null);
    close.mutate(
      { id: shift.id, countedCash: counted, note: note.trim() || null },
      {
        onSuccess: (closed) => {
          toast.success(`Đã đóng ca ${closed.code}`);
          onOpenChange(false);
        },
        onError: (e) => setError(toApiError(e).message),
      },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !close.isPending && onOpenChange(o)}
      title={`Ca ${shift.code}`}
      description={`Mở lúc ${formatDateTime(shift.opened_at)} bởi ${shift.opened_by.full_name}. Két chung — mọi thu ngân bán trong ca này.`}
      className="max-w-lg"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={close.isPending}>
            Để sau
          </Button>
          <Button variant="destructive" onClick={submit} loading={close.isPending}>
            Đóng ca
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <ShiftSummary shift={shift} />
        <div className="space-y-3 border-t border-border pt-4">
          <FormField label="Tiền đếm được trong két" htmlFor="counted-cash" required>
            <MoneyInput id="counted-cash" value={counted} onChange={setCounted} invalid={!!error && counted === ""} />
          </FormField>
          {difference !== null && (
            <p className="flex items-center justify-between text-sm" aria-live="polite">
              <span className="text-muted">Chênh lệch</span>
              <DifferenceBadge value={difference} />
            </p>
          )}
          {needsNote && (
            <FormField label="Lý do chênh lệch" htmlFor="close-note" required>
              <Input id="close-note" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
            </FormField>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
      </div>
    </Dialog>
  );
}
