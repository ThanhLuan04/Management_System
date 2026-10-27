import { BarChart3, CheckCircle2, Minus, Plus, Printer, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";

import { Button, buttonClass } from "@/components/ui/Button";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Dialog } from "@/components/ui/Dialog";
import { FormField, Input } from "@/components/ui/Input";
import { MoneyInput } from "@/components/ui/MoneyInput";
import type { Product } from "@/features/catalog/api";
import { ProductThumb } from "@/features/catalog/components";
import { ProductPicker } from "@/features/catalog/ProductPicker";
import type { Customer } from "@/features/partners/api";
import { newIdempotencyKey, type Order, type PaymentMethod, useCreateOrder, useMySales, useStoreSettings } from "@/features/sales/api";
import { PAYMENT_METHOD_LABELS } from "@/features/sales/OrderStatusBadge";
import { PrintableReceipt } from "@/features/sales/Receipt";
import { toApiError } from "@/services/apiError";
import { cn } from "@/utils/cn";
import { formatMoney, formatNumber, toNumber } from "@/utils/format";

import { addToCart, type CartLine, cartTotals, cashSuggestions, type Discount, lineSubtotal, setQuantity } from "./cart";
import { CustomerSelect } from "./CustomerSelect";
import { ProductGrid } from "./ProductGrid";

const METHODS: PaymentMethod[] = ["CASH", "BANK_TRANSFER", "CARD"];

function MySalesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { data, isPending } = useMySales(open);
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Doanh số hôm nay của tôi" description="Dùng để đối chiếu tiền mặt khi giao ca.">
      {isPending || !data ? (
        <p className="text-sm text-muted">Đang tải…</p>
      ) : (
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between"><dt className="text-muted">Số đơn</dt><dd className="tabular">{formatNumber(data.order_count)}</dd></div>
          <div className="flex justify-between"><dt className="text-muted">Doanh thu gộp</dt><dd className="tabular">{formatMoney(data.gross_revenue)}</dd></div>
          <div className="flex justify-between"><dt className="text-muted">Đã hoàn trả</dt><dd className="tabular">−{formatMoney(data.refunds)}</dd></div>
          {data.received_by_method.map((m) => (
            <div key={m.method} className="flex justify-between"><dt className="text-muted">Thu {PAYMENT_METHOD_LABELS[m.method].toLowerCase()}</dt><dd className="tabular">{formatMoney(m.amount)}</dd></div>
          ))}
          <div className="flex justify-between border-t border-border pt-2 text-base font-semibold">
            <dt>Tiền mặt phải có trong két</dt>
            <dd className="tabular">{formatMoney(data.cash_in_drawer)}</dd>
          </div>
        </dl>
      )}
    </Dialog>
  );
}

export function PosPage() {
  const store = useStoreSettings();
  const createOrder = useCreateOrder();

  const [cart, setCart] = useState<CartLine[]>([]);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [discount, setDiscount] = useState<Discount>({ type: "PERCENT", value: "" });
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [cash, setCash] = useState("");
  const [referenceNote, setReferenceNote] = useState("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<{ discount?: string; cash?: string }>({});
  // product_id → số còn trong kho theo server (khi server báo hết hàng)
  const [shortages, setShortages] = useState<Record<number, number>>({});
  const [lastOrder, setLastOrder] = useState<Order | null>(null);
  const [showMySales, setShowMySales] = useState(false);

  // Một key cho mỗi giỏ hàng: chỉ đổi sau khi bán xong / xóa giỏ. Bấm lại sau lỗi mạng dùng đúng key cũ.
  const idempotencyKey = useRef(newIdempotencyKey());
  const pickerWrapper = useRef<HTMLDivElement>(null);

  const totals = cartTotals(cart, discount);
  const limit = store.data?.my_max_discount_percent;
  const maxPercent = limit === null || limit === undefined ? null : toNumber(limit);
  const cashValue = toNumber(cash);
  const change = method === "CASH" && cash !== "" ? cashValue - totals.total : null;

  const resetCart = useCallback(() => {
    setCart([]);
    setCustomer(null);
    setDiscount({ type: "PERCENT", value: "" });
    setMethod("CASH");
    setCash("");
    setReferenceNote("");
    setNote("");
    setErrors({});
    setShortages({});
    idempotencyKey.current = newIdempotencyKey();
  }, []);

  const addProduct = (product: Product) => {
    setCart((prev) => addToCart(prev, product));
    setShortages((prev) => {
      const next = { ...prev };
      delete next[product.id];
      return next;
    });
  };

  const checkout = () => {
    const nextErrors: typeof errors = {};
    if (maxPercent !== null && totals.discountPercent > maxPercent + 1e-9) {
      nextErrors.discount = `Bạn chỉ được giảm tối đa ${maxPercent}% giá trị đơn`;
    }
    if (method === "CASH" && (cash === "" || cashValue < totals.total)) {
      nextErrors.cash = cash === "" ? "Nhập số tiền khách đưa" : "Tiền khách đưa chưa đủ";
    }
    setErrors(nextErrors);
    if (cart.length === 0 || Object.keys(nextErrors).length > 0 || createOrder.isPending) return;

    createOrder.mutate(
      {
        idempotencyKey: idempotencyKey.current,
        payload: {
          customer_id: customer?.id ?? null,
          items: cart.map((l) => ({ product_id: l.product.id, quantity: l.quantity })),
          discount: totals.discount > 0 ? { type: discount.type, value: discount.value } : null,
          payment:
            method === "CASH"
              ? { method, cash_received: cash }
              : { method, reference_note: referenceNote.trim() || null },
          note: note.trim() || null,
        },
      },
      {
        onSuccess: (order) => {
          setLastOrder(order);
          resetCart();
        },
        onError: (error) => {
          const apiError = toApiError(error);
          switch (apiError.code) {
            case "OUT_OF_STOCK": {
              const rows = apiError.details as { product_id: number; available: number }[];
              setShortages(Object.fromEntries(rows.map((r) => [r.product_id, r.available])));
              toast.error("Một số sản phẩm không đủ hàng — xem các dòng được đánh dấu");
              break;
            }
            case "DISCOUNT_EXCEEDS_LIMIT":
              setErrors((e) => ({ ...e, discount: apiError.message }));
              break;
            case "INSUFFICIENT_PAYMENT":
              setErrors((e) => ({ ...e, cash: apiError.message }));
              break;
            case "IDEMPOTENCY_CONFLICT":
              // Lần gửi trước (cùng key) đã tạo đơn nhưng phản hồi bị mất, sau đó giỏ hàng bị sửa
              toast.error("Lần thanh toán trước có thể đã tạo đơn. Kiểm tra Đơn hàng trước khi thanh toán lại.", {
                action: { label: "Xem đơn", onClick: () => window.open(`/orders/${(apiError.details as { order_id: number }).order_id}`, "_blank") },
                duration: 10_000,
              });
              idempotencyKey.current = newIdempotencyKey();
              break;
            case "NETWORK_ERROR":
              toast.error("Mất kết nối máy chủ. Bấm Thanh toán lại — hệ thống không tạo đơn trùng.");
              break;
            default: {
              const skus = (apiError.details as { skus?: string[] } | undefined)?.skus;
              toast.error(skus ? `${apiError.message}: ${skus.join(", ")}` : apiError.message);
            }
          }
        },
      },
    );
  };

  // Phím tắt: F2 tìm sản phẩm, F9 thanh toán
  const checkoutRef = useRef(checkout);
  checkoutRef.current = checkout;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "F2") {
        event.preventDefault();
        pickerWrapper.current?.querySelector("input")?.focus();
      } else if (event.key === "F9") {
        event.preventDefault();
        checkoutRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Bán hàng</h1>
        <Button variant="outline" size="sm" onClick={() => setShowMySales(true)}>
          <BarChart3 className="h-4 w-4" aria-hidden /> Doanh số hôm nay
        </Button>
      </div>

      {/* Trái: tìm/quét + lưới sản phẩm. Phải: giỏ hàng + thanh toán (luôn nhìn thấy cả hai) */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_400px]">
        <Card className="min-w-0">
          <CardContent className="space-y-4">
            <div ref={pickerWrapper}>
              <ProductPicker onSelect={addProduct} autoFocus label="Tìm sản phẩm để bán (F2)" />
            </div>
            <ProductGrid onSelect={addProduct} inCart={Object.fromEntries(cart.map((l) => [l.product.id, l.quantity]))} />
          </CardContent>
        </Card>

        {/* Màn hình lớn: khung vừa màn hình kể cả khi chưa cuộn trang (đỉnh khung cách mép trên ~8rem);
            phần giữa (giỏ + nhập thanh toán) cuộn, đáy ghim */}
        <Card className="flex h-fit flex-col overflow-hidden lg:sticky lg:top-20 lg:max-h-[calc(100vh-9rem)]">
          <CardHeader
            className="shrink-0 pb-3"
            title={`Giỏ hàng${cart.length ? ` (${formatNumber(totals.itemCount)})` : ""}`}
            actions={
              cart.length > 0 && (
                <Button variant="ghost" size="sm" onClick={resetCart}>
                  Xóa giỏ
                </Button>
              )
            }
          />
          <CardContent className="min-h-0 flex-1 space-y-4 overflow-y-auto pt-2">
            {cart.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted">
                Bấm vào sản phẩm hoặc quét mã vạch để thêm vào giỏ.
              </p>
            ) : (
              <ul className="-mx-2 divide-y divide-border" aria-label="Giỏ hàng">
                {cart.map((line) => {
                  const available = shortages[line.product.id] ?? line.product.quantity;
                  const short = line.quantity > available;
                  return (
                    <li key={line.product.id} className={cn("px-2 py-2.5", short && "rounded-md bg-destructive-soft")}>
                      <div className="flex items-start gap-2.5">
                        <ProductThumb url={line.product.image_url} name={line.product.name} className="h-9 w-9 text-xs" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium" title={line.product.name}>
                            {line.product.name}
                          </p>
                          <p className="tabular text-xs text-muted">
                            {formatMoney(line.product.sale_price)} · còn {formatNumber(available)} {line.product.unit}
                          </p>
                          {short && <p className="text-xs font-medium text-destructive">Chỉ còn {formatNumber(available)} trong kho</p>}
                        </div>
                        <Button variant="ghost" size="icon" className="-mt-1 h-8 w-8" aria-label={`Xóa ${line.product.name}`} onClick={() => setCart((c) => setQuantity(c, line.product.id, 0))}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="mt-1.5 flex items-center justify-between pl-[46px]">
                        <div className="flex items-center gap-1">
                          <Button variant="outline" size="icon" className="h-8 w-8" aria-label={`Giảm ${line.product.name}`} onClick={() => setCart((c) => setQuantity(c, line.product.id, line.quantity - 1))}>
                            <Minus className="h-3.5 w-3.5" />
                          </Button>
                          <Input
                            aria-label={`Số lượng ${line.product.name}`}
                            inputMode="numeric"
                            value={line.quantity}
                            onChange={(e) => {
                              const n = Number(e.target.value.replace(/\D/g, ""));
                              if (n > 0) setCart((c) => setQuantity(c, line.product.id, n));
                            }}
                            className="h-8 w-14 text-center tabular"
                          />
                          <Button variant="outline" size="icon" className="h-8 w-8" aria-label={`Tăng ${line.product.name}`} onClick={() => setCart((c) => setQuantity(c, line.product.id, line.quantity + 1))}>
                            <Plus className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                        <span className="tabular font-semibold">{formatMoney(lineSubtotal(line))}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="border-t border-border pt-4">
              <h2 className="mb-3 text-base font-semibold">Thanh toán</h2>
              <div className="space-y-4">
                <CustomerSelect value={customer} onChange={setCustomer} />

                <dl className="space-y-1.5 text-sm">
                  <div className="flex justify-between"><dt className="text-muted">Tạm tính ({formatNumber(totals.itemCount)} sp)</dt><dd className="tabular">{formatMoney(totals.subtotal)}</dd></div>
                </dl>

                <FormField label="Giảm giá" htmlFor="discount" error={errors.discount} hint={maxPercent === null ? "Không giới hạn" : `Tối đa ${maxPercent}% giá trị đơn`}>
                  <div className="flex gap-2">
                    {discount.type === "PERCENT" ? (
                      <Input
                        id="discount"
                        inputMode="decimal"
                        className="text-right tabular"
                        value={discount.value}
                        invalid={!!errors.discount}
                        onChange={(e) => setDiscount({ type: "PERCENT", value: e.target.value.replace(/[^\d.]/g, "").slice(0, 5) })}
                        placeholder="0"
                      />
                    ) : (
                      <MoneyInput id="discount" invalid={!!errors.discount} value={discount.value} onChange={(v) => setDiscount({ type: "AMOUNT", value: v })} />
                    )}
                    <div role="radiogroup" aria-label="Kiểu giảm giá" className="inline-flex shrink-0 rounded-md border border-border p-0.5">
                      {(["PERCENT", "AMOUNT"] as const).map((t) => (
                        <button
                          key={t}
                          type="button"
                          role="radio"
                          aria-checked={discount.type === t}
                          onClick={() => setDiscount({ type: t, value: "" })}
                          className={cn("rounded px-3 text-sm", discount.type === t ? "bg-primary text-primary-foreground" : "text-muted")}
                        >
                          {t === "PERCENT" ? "%" : "₫"}
                        </button>
                      ))}
                    </div>
                  </div>
                </FormField>

                <div role="radiogroup" aria-label="Phương thức thanh toán" className="grid grid-cols-3 gap-2">
                  {METHODS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      role="radio"
                      aria-checked={method === m}
                      onClick={() => setMethod(m)}
                      className={cn("rounded-md border px-2 py-2 text-sm", method === m ? "border-primary bg-primary/10 font-medium text-primary" : "border-border")}
                    >
                      {PAYMENT_METHOD_LABELS[m]}
                    </button>
                  ))}
                </div>

                {method === "CASH" ? (
                  <>
                    <FormField label="Khách đưa" htmlFor="cash" error={errors.cash}>
                      <MoneyInput id="cash" value={cash} onChange={setCash} invalid={!!errors.cash} />
                    </FormField>
                    <div className="flex flex-wrap gap-2">
                      {cashSuggestions(totals.total).map((v) => (
                        <Button key={v} variant="secondary" size="sm" onClick={() => setCash(String(v))}>
                          {formatNumber(v)}
                        </Button>
                      ))}
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted">Tiền thừa</span>
                      <span className={cn("tabular font-semibold", change !== null && change < 0 && "text-destructive")}>
                        {change === null ? "—" : formatMoney(change)}
                      </span>
                    </div>
                  </>
                ) : (
                  <FormField label="Mã giao dịch (tùy chọn)" htmlFor="reference" hint="Hệ thống chỉ ghi nhận, không kết nối ngân hàng">
                    <Input id="reference" value={referenceNote} maxLength={100} onChange={(e) => setReferenceNote(e.target.value)} />
                  </FormField>
                )}

                <FormField label="Ghi chú đơn" htmlFor="order-note">
                  <Input id="order-note" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
                </FormField>
              </div>
            </div>
          </CardContent>

          {/* Ghim ở đáy khung: giỏ dài đến đâu vẫn thấy tổng tiền và nút Thanh toán */}
          <div className="shrink-0 space-y-3 border-t border-border bg-card px-5 py-4">
            <div className="flex items-baseline justify-between">
              <span className="font-semibold">Khách cần trả</span>
              <span className="tabular text-2xl font-bold">{formatMoney(totals.total)}</span>
            </div>
            {totals.discount > 0 && <p className="-mt-3 text-right text-xs text-muted">đã giảm {formatMoney(totals.discount)}</p>}
            <Button size="lg" className="w-full" loading={createOrder.isPending} disabled={cart.length === 0} onClick={checkout}>
              Thanh toán (F9)
            </Button>
          </div>
        </Card>
      </div>

      {lastOrder && (
        <>
          <Dialog
            open
            onOpenChange={(open) => !open && setLastOrder(null)}
            title="Thanh toán thành công"
            description={`Đơn ${lastOrder.code}`}
            footer={
              <>
                <Link to={`/orders/${lastOrder.id}`} className={buttonClass({ variant: "outline" })}>
                  Xem đơn
                </Link>
                <Button variant="outline" onClick={() => window.print()}>
                  <Printer className="h-4 w-4" aria-hidden /> In hóa đơn
                </Button>
                <Button autoFocus onClick={() => setLastOrder(null)}>
                  Đơn mới
                </Button>
              </>
            }
          >
            <div className="flex flex-col items-center gap-2 py-2 text-center">
              <CheckCircle2 className="h-12 w-12 text-success" aria-hidden />
              <p className="tabular text-3xl font-bold">{formatMoney(lastOrder.total_amount)}</p>
              {lastOrder.payments[0]?.change_amount && Number(lastOrder.payments[0].change_amount) > 0 && (
                <p className="text-lg">
                  Tiền thừa: <span className="tabular font-semibold">{formatMoney(lastOrder.payments[0].change_amount)}</span>
                </p>
              )}
            </div>
          </Dialog>
          <PrintableReceipt order={lastOrder} store={store.data} />
        </>
      )}
      <MySalesDialog open={showMySales} onOpenChange={setShowMySales} />
    </>
  );
}
