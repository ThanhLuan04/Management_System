import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock, Minus, Plus, Printer, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";

import { ErrorState } from "@/components/common/States";
import { Button, buttonClass } from "@/components/ui/Button";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Dialog } from "@/components/ui/Dialog";
import { FormField, Input } from "@/components/ui/Input";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { Skeleton } from "@/components/ui/Spinner";
import type { Product } from "@/features/catalog/api";
import { ProductThumb } from "@/features/catalog/components";
import { ProductPicker } from "@/features/catalog/ProductPicker";
import type { Customer } from "@/features/partners/api";
import { newIdempotencyKey, type Order, useCreateOrder, useStoreSettings } from "@/features/sales/api";
import { PAYMENT_METHOD_LABELS } from "@/features/sales/OrderStatusBadge";
import { PrintableReceipt } from "@/features/sales/Receipt";
import { useCurrentShift } from "@/features/shifts/api";
import { CloseShiftDialog, OpenShiftCard } from "@/features/shifts/components";
import { toApiError } from "@/services/apiError";
import { cn } from "@/utils/cn";
import { formatMoney, formatNumber, toNumber } from "@/utils/format";

import { addToCart, type CartLine, cartTotals, cashSuggestions, type Discount, lineSubtotal, setQuantity } from "./cart";
import { CustomerSelect } from "./CustomerSelect";
import { buildPayment, emptySplit, type PayMode, type PaymentErrors, SPLIT_METHODS, splitTotal } from "./payment";
import { ProductGrid } from "./ProductGrid";
import { TransferQr } from "./TransferQr";
import { transferReference } from "./vietqr";

const METHODS: PayMode[] = ["CASH", "BANK_TRANSFER", "CARD", "MIXED"];

export function PosPage() {
  const store = useStoreSettings();
  const createOrder = useCreateOrder();
  const queryClient = useQueryClient();
  // Két chung: phải có ca đang mở mới bán được (máy chủ cũng chặn)
  const current = useCurrentShift();
  const shift = current.data?.shift ?? null;

  const [cart, setCart] = useState<CartLine[]>([]);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [discount, setDiscount] = useState<Discount>({ type: "PERCENT", value: "" });
  const [method, setMethod] = useState<PayMode>("CASH");
  const [cash, setCash] = useState("");
  const [referenceNote, setReferenceNote] = useState("");
  const [split, setSplit] = useState(emptySplit);
  const [transferConfirmed, setTransferConfirmed] = useState(false);
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<{ discount?: string } & PaymentErrors>({});
  // product_id → số còn trong kho theo server (khi server báo hết hàng)
  const [shortages, setShortages] = useState<Record<number, number>>({});
  const [lastOrder, setLastOrder] = useState<Order | null>(null);
  const [showShift, setShowShift] = useState(false);

  // Một key cho mỗi giỏ hàng: chỉ đổi sau khi bán xong / xóa giỏ. Bấm lại sau lỗi mạng dùng đúng key cũ.
  const idempotencyKey = useRef(newIdempotencyKey());
  const pickerWrapper = useRef<HTMLDivElement>(null);

  const totals = cartTotals(cart, discount);
  const limit = store.data?.my_max_discount_percent;
  const maxPercent = limit === null || limit === undefined ? null : toNumber(limit);
  const cashValue = toNumber(cash);
  const change = method === "CASH" && cash !== "" ? cashValue - totals.total : null;

  // Có tài khoản nhận tiền trong Cài đặt → hiện mã VietQR; mã đối soát cố định theo giỏ hàng (đổi khi sang giỏ mới)
  const bank = store.data;
  const qrEnabled = !!bank?.bank_bin && !!bank.bank_account_number;
  const transferRef = qrEnabled ? transferReference(idempotencyKey.current) : null;
  const transferAmount = method === "BANK_TRANSFER" ? totals.total : method === "MIXED" ? toNumber(split.BANK_TRANSFER || 0) : 0;

  // Số tiền cần chuyển thay đổi (sửa giỏ, đổi cách trả, chia lại) → phải xác nhận lại đã nhận đúng số tiền mới
  useEffect(() => setTransferConfirmed(false), [transferAmount, method]);

  const resetCart = useCallback(() => {
    setCart([]);
    setCustomer(null);
    setDiscount({ type: "PERCENT", value: "" });
    setMethod("CASH");
    setCash("");
    setReferenceNote("");
    setSplit(emptySplit());
    setTransferConfirmed(false);
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
    const payment = buildPayment(
      { mode: method, cash, reference: referenceNote, split, transferConfirmed },
      totals.total,
      transferRef,
    );
    if (!payment.ok) Object.assign(nextErrors, payment.errors);
    setErrors(nextErrors);
    if (cart.length === 0 || !payment.ok || Object.keys(nextErrors).length > 0 || createOrder.isPending) return;

    createOrder.mutate(
      {
        idempotencyKey: idempotencyKey.current,
        payload: {
          customer_id: customer?.id ?? null,
          items: cart.map((l) => ({ product_id: l.product.id, quantity: l.quantity })),
          discount: totals.discount > 0 ? { type: discount.type, value: discount.value } : null,
          ...payment.payload,
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
              setErrors((e) => (method === "MIXED" ? { ...e, split: apiError.message } : { ...e, cash: apiError.message }));
              break;
            case "NO_OPEN_SHIFT":
              // Ca vừa được đóng ở máy khác → tải lại trạng thái ca (màn hình chuyển sang mở ca, giỏ hàng giữ nguyên)
              toast.error(apiError.message);
              queryClient.invalidateQueries({ queryKey: ["shifts"] });
              break;
            case "PAYMENT_MISMATCH":
              // Giá trên máy chủ khác lúc thêm vào giỏ (vừa đổi giá) → tổng mới khác số đã chia
              setErrors((e) => ({ ...e, split: apiError.message }));
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

  if (current.isPending) return <Skeleton className="h-96" />;
  if (current.error) return <ErrorState error={current.error} onRetry={() => current.refetch()} />;
  if (!shift) {
    return (
      <>
        <h1 className="mb-6 text-2xl font-semibold tracking-tight">Bán hàng</h1>
        <OpenShiftCard suggested={current.data.suggested_opening_cash} />
      </>
    );
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Bán hàng</h1>
        <Button variant="outline" size="sm" onClick={() => setShowShift(true)}>
          <Clock className="h-4 w-4" aria-hidden /> Ca {shift.code} · Đóng ca
        </Button>
      </div>

      {/* Trái: tìm/quét + lưới sản phẩm. Phải: giỏ hàng + thanh toán (luôn nhìn thấy cả hai) */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_400px]">
        <Card className="min-w-0">
          <CardContent className="space-y-4">
            <div ref={pickerWrapper}>
              <ProductPicker onSelect={addProduct} autoFocus label="Tìm sản phẩm để bán (F2)" filter={{ sellable: true }} />
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

                <div role="radiogroup" aria-label="Phương thức thanh toán" className="grid grid-cols-2 gap-2">
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

                {method === "CASH" && (
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
                )}

                {method === "MIXED" && (
                  <div className="space-y-2" role="group" aria-label="Chia tiền theo phương thức">
                    {SPLIT_METHODS.map((m) => {
                      const others = splitTotal(split) - toNumber(split[m] || 0);
                      return (
                        <div key={m} className="flex items-center gap-2">
                          <label htmlFor={`split-${m}`} className="w-24 shrink-0 text-sm">
                            {PAYMENT_METHOD_LABELS[m]}
                          </label>
                          <div className="flex-1">
                            <MoneyInput id={`split-${m}`} value={split[m]} onChange={(v) => setSplit((s) => ({ ...s, [m]: v }))} invalid={!!errors.split} />
                          </div>
                          <Button variant="ghost" size="sm" title="Điền phần còn lại" aria-label={`Điền phần còn lại vào ${PAYMENT_METHOD_LABELS[m]}`} onClick={() => setSplit((s) => ({ ...s, [m]: String(Math.max(0, totals.total - others)) }))}>
                            Còn lại
                          </Button>
                        </div>
                      );
                    })}
                    <p className={cn("flex justify-between text-sm", errors.split ? "text-destructive" : "text-muted")} role={errors.split ? "alert" : undefined}>
                      <span>{errors.split ?? "Đã chia"}</span>
                      <span className="tabular">
                        {formatMoney(splitTotal(split))} / {formatMoney(totals.total)}
                      </span>
                    </p>
                  </div>
                )}

                {/* Chuyển khoản (riêng hoặc trong kết hợp): mã VietQR + thu ngân xác nhận đã nhận tiền */}
                {(method === "BANK_TRANSFER" || method === "MIXED") && qrEnabled && bank && transferRef && transferAmount > 0 && (
                  <div className="space-y-2">
                    <TransferQr
                      bankBin={bank.bank_bin}
                      accountNumber={bank.bank_account_number}
                      accountName={bank.bank_account_name}
                      amount={transferAmount}
                      note={transferRef}
                      size={180}
                    />
                    <label className={cn("flex items-start gap-2 rounded-md border p-2 text-sm", errors.transfer ? "border-destructive bg-destructive-soft" : "border-border")}>
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
                        checked={transferConfirmed}
                        onChange={(e) => setTransferConfirmed(e.target.checked)}
                      />
                      <span>
                        Đã nhận đủ <strong className="tabular">{formatMoney(transferAmount)}</strong> — kiểm tra thông báo ngân hàng có nội dung <strong>{transferRef}</strong>
                      </span>
                    </label>
                    {errors.transfer && (
                      <p role="alert" className="text-xs text-destructive">
                        {errors.transfer}
                      </p>
                    )}
                  </div>
                )}

                {((method === "BANK_TRANSFER" && !qrEnabled) || method === "CARD") && (
                  <FormField
                    label="Mã giao dịch (tùy chọn)"
                    htmlFor="reference"
                    hint={method === "BANK_TRANSFER" ? "Chưa có tài khoản nhận tiền — Admin điền trong Cài đặt để hiện mã QR" : "Hệ thống chỉ ghi nhận, không kết nối ngân hàng"}
                  >
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
      <CloseShiftDialog shift={shift} open={showShift} onOpenChange={setShowShift} />
    </>
  );
}
