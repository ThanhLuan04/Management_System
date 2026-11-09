import { Bell, BellOff, Printer, Undo2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { EmptyState, ErrorState, PageHeader } from "@/components/common/States";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Spinner";
import { KITCHEN_LABELS, type KitchenStatus, SERVICE_LABELS } from "@/features/sales/api";
import { toApiError } from "@/services/apiError";
import { cn } from "@/utils/cn";
import { formatNumber } from "@/utils/format";

import { type KitchenTicket, minutesSince, nextStatus, previousStatus, useKitchenAction, useKitchenTickets } from "./api";
import { KitchenTicketPrint, type PrintableTicket, printKitchenTicket } from "./KitchenTicketPrint";

const ACTION_LABELS: Record<KitchenStatus, string> = {
  NEW: "Bắt đầu",
  COOKING: "Xong",
  READY: "Đã giao",
  SERVED: "",
};

const STATUS_VARIANTS = { NEW: "muted", COOKING: "info", READY: "success", SERVED: "muted" } as const;

const SOUND_KEY = "smartstore.kitchen.sound";

function readSoundSetting(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) === "on";
  } catch {
    return false;
  }
}

/** Tiếng "ting" ngắn bằng Web Audio — không cần file âm thanh. */
function beep(context: AudioContext) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.frequency.value = 880;
  gain.gain.setValueAtTime(0.25, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.6);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.6);
}

function WaitBadge({ createdAt, now }: { createdAt: string; now: number }) {
  const minutes = minutesSince(createdAt, now);
  return (
    <span
      className={cn(
        "tabular rounded-md px-2 py-0.5 text-xs font-semibold",
        minutes >= 20 ? "bg-destructive-soft text-destructive-strong" : minutes >= 10 ? "bg-warning-soft text-warning-strong" : "bg-surface-hover text-muted",
      )}
      title="Thời gian từ lúc đặt"
    >
      {minutes} phút
    </span>
  );
}

function TicketCard({
  ticket,
  now,
  busy,
  onAction,
  onPrint,
}: {
  ticket: KitchenTicket;
  now: number;
  busy: boolean;
  onAction: (action: Parameters<ReturnType<typeof useKitchenAction>["mutate"]>[0], success?: string) => void;
  onPrint: (ticket: KitchenTicket) => void;
}) {
  const title = ticket.queue_number !== null ? `Số ${ticket.queue_number}` : ticket.code;
  const anyBeforeReady = ticket.items.some((i) => i.kitchen_status === "NEW" || i.kitchen_status === "COOKING");
  const anyUnserved = ticket.items.some((i) => i.kitchen_status !== "SERVED");

  return (
    <Card
      role="region"
      aria-label={`Phiếu ${title}`}
      className={cn("flex flex-col", ticket.cancelled && "border-2 border-destructive")}
    >
      <div className="flex items-start justify-between gap-2 border-b border-border p-4">
        <div>
          <p className="text-2xl leading-none font-bold">{title}</p>
          <p className="mt-1 text-sm font-medium">
            {ticket.service_type ? SERVICE_LABELS[ticket.service_type] : "—"}
            {ticket.table_label && ` · ${ticket.table_label}`}
          </p>
          <p className="text-xs text-muted">{ticket.code}</p>
        </div>
        <WaitBadge createdAt={ticket.created_at} now={now} />
      </div>

      {ticket.cancelled && (
        <div role="alert" className="bg-destructive-soft px-4 py-3 text-sm text-destructive-strong">
          <p className="font-bold">ĐÃ HỦY — dừng làm</p>
          {ticket.cancel_reason && <p>Lý do: {ticket.cancel_reason}</p>}
        </div>
      )}

      <ul className="flex-1 divide-y divide-border">
        {ticket.items.map((item) => {
          const next = nextStatus(item.kitchen_status);
          const previous = previousStatus(item.kitchen_status);
          const served = item.kitchen_status === "SERVED";
          return (
            <li key={item.id} className={cn("flex items-start gap-3 px-4 py-3", served && "opacity-50")}>
              <div className="min-w-0 flex-1">
                <p className={cn("font-semibold", served && "line-through")}>
                  <span className="tabular">{formatNumber(item.quantity)}</span> × {item.product_name}
                </p>
                {item.note && <p className="text-sm font-medium text-warning-strong">→ {item.note}</p>}
                <Badge variant={STATUS_VARIANTS[item.kitchen_status]} className="mt-1">
                  {KITCHEN_LABELS[item.kitchen_status]}
                </Badge>
              </div>
              {!ticket.cancelled && (
                <div className="flex shrink-0 items-center gap-1">
                  {previous && (
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={busy}
                      aria-label={`Lùi ${item.product_name} về "${KITCHEN_LABELS[previous]}"`}
                      onClick={() => onAction({ type: "item", itemId: item.id, status: previous })}
                    >
                      <Undo2 className="h-4 w-4" />
                    </Button>
                  )}
                  {next && (
                    <Button
                      size="sm"
                      variant={next === "SERVED" ? "outline" : "default"}
                      disabled={busy}
                      aria-label={`${ACTION_LABELS[item.kitchen_status]}: ${item.product_name}`}
                      onClick={() => onAction({ type: "item", itemId: item.id, status: next })}
                    >
                      {ACTION_LABELS[item.kitchen_status]}
                    </Button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {ticket.note && <p className="border-t border-border px-4 py-2 text-sm">Ghi chú: {ticket.note}</p>}

      <div className="flex flex-wrap gap-2 border-t border-border p-3">
        {ticket.cancelled ? (
          <Button variant="destructive" className="flex-1" disabled={busy} onClick={() => onAction({ type: "acknowledge", orderId: ticket.order_id })}>
            Đã biết
          </Button>
        ) : (
          <>
            {anyBeforeReady && (
              <Button className="flex-1" disabled={busy} onClick={() => onAction({ type: "ticket", orderId: ticket.order_id, status: "READY" }, `${title}: xong cả phiếu`)}>
                Xong cả phiếu
              </Button>
            )}
            {!anyBeforeReady && anyUnserved && (
              <Button
                variant="outline"
                className="flex-1"
                disabled={busy}
                onClick={() => onAction({ type: "ticket", orderId: ticket.order_id, status: "SERVED" }, `${title}: đã giao`)}
              >
                Giao cả phiếu
              </Button>
            )}
          </>
        )}
        <Button variant="ghost" size="icon" aria-label={`In phiếu ${title}`} onClick={() => onPrint(ticket)}>
          <Printer className="h-4 w-4" />
        </Button>
      </div>
    </Card>
  );
}

export function KitchenPage() {
  const { data, error, isPending, refetch } = useKitchenTickets();
  const action = useKitchenAction();
  const [now, setNow] = useState(() => Date.now());
  const [sound, setSound] = useState(readSoundSetting);
  const [printing, setPrinting] = useState<PrintableTicket | null>(null);
  const audio = useRef<AudioContext | null>(null);
  const seen = useRef<Set<number> | null>(null);

  // Cập nhật số phút chờ mỗi 30 giây
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  // Phiếu mới xuất hiện (không tính lần tải đầu) → báo "ting" nếu bật âm thanh
  useEffect(() => {
    if (!data) return;
    const ids = new Set(data.map((t) => t.order_id));
    const previous = seen.current;
    seen.current = ids;
    if (!previous || !sound || !audio.current) return;
    if ([...ids].some((id) => !previous.has(id))) beep(audio.current);
  }, [data, sound]);

  // Phiếu cần in đã được gắn vào trang → mở hộp thoại in
  useEffect(() => {
    if (!printing) return;
    printKitchenTicket();
    setPrinting(null);
  }, [printing]);

  const toggleSound = () => {
    const next = !sound;
    // Trình duyệt chỉ cho phát âm thanh sau một thao tác của người dùng → tạo AudioContext ngay lúc bấm
    if (next && !audio.current) audio.current = new AudioContext();
    if (next && audio.current) beep(audio.current);
    setSound(next);
    try {
      localStorage.setItem(SOUND_KEY, next ? "on" : "off");
    } catch {
      /* chế độ riêng tư: chỉ nhớ trong phiên này */
    }
  };

  const run = (payload: Parameters<typeof action.mutate>[0], success?: string) =>
    action.mutate(payload, {
      onSuccess: () => success && toast.success(success),
      onError: (e) => toast.error(toApiError(e).message),
    });

  const count = (status: KitchenStatus) =>
    (data ?? []).filter((t) => !t.cancelled).flatMap((t) => t.items).filter((i) => i.kitchen_status === status).reduce((s, i) => s + i.quantity, 0);

  return (
    <>
      <PageHeader
        title="Bếp"
        description={data ? `Chờ ${count("NEW")} · Đang làm ${count("COOKING")} · Xong chờ giao ${count("READY")} món` : "Phiếu món theo thứ tự đặt — tự cập nhật mỗi 5 giây"}
        actions={
          <Button variant="outline" onClick={toggleSound} aria-pressed={sound}>
            {sound ? <Bell className="h-4 w-4" aria-hidden /> : <BellOff className="h-4 w-4" aria-hidden />}
            {sound ? "Âm báo: bật" : "Âm báo: tắt"}
          </Button>
        }
      />
      {error && !data ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : isPending ? (
        <Skeleton className="h-64" />
      ) : data.length === 0 ? (
        <EmptyState title="Chưa có món nào cần làm" description="Đơn có món ăn sẽ hiện ở đây ngay sau khi thanh toán." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {data.map((ticket) => (
            <TicketCard key={ticket.order_id} ticket={ticket} now={now} busy={action.isPending} onAction={run} onPrint={setPrinting} />
          ))}
        </div>
      )}
      {printing && <KitchenTicketPrint ticket={printing} />}
    </>
  );
}
