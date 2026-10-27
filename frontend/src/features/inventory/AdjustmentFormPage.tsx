import { Trash2 } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { PageHeader } from "@/components/common/States";
import { Button, buttonClass } from "@/components/ui/Button";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { FormField, Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Select";
import type { Product } from "@/features/catalog/api";
import { ProductPicker } from "@/features/catalog/ProductPicker";
import { toApiError } from "@/services/apiError";
import { cn } from "@/utils/cn";
import { formatNumber } from "@/utils/format";

import { type AdjustmentType, useCreateAdjustment } from "./api";
import { previewLine } from "./preview";

interface Line {
  product: Product;
  value: string;
}

function DiffCell({ change, after, isStocktake }: { change: number | null; after: number | null; isStocktake: boolean }) {
  if (change === null) return <>—</>;
  if (!isStocktake) return <>{formatNumber(after ?? 0)}</>;
  if (change === 0) return <span className="text-muted">Khớp</span>;
  return (
    <span className={change > 0 ? "text-green-700" : "text-red-700"}>
      {change > 0 ? "+" : "−"}
      {formatNumber(Math.abs(change))}
    </span>
  );
}

export function AdjustmentFormPage() {
  const [searchParams] = useSearchParams();
  const type: AdjustmentType = searchParams.get("type") === "STOCKTAKE" ? "STOCKTAKE" : "ADJUSTMENT";
  // key: chuyển giữa Kiểm kê ↔ Điều chỉnh (cùng route, khác ?type=) phải bắt đầu một phiếu mới
  return <AdjustmentForm key={type} type={type} />;
}

function AdjustmentForm({ type }: { type: AdjustmentType }) {
  const isStocktake = type === "STOCKTAKE";
  const navigate = useNavigate();
  const create = useCreateAdjustment();

  const [reason, setReason] = useState(isStocktake ? "Kiểm kê định kỳ" : "");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Cho phép chọn cả sản phẩm đã ngừng kinh doanh: hàng còn tồn của chúng vẫn cần đếm / điều chỉnh
  const addProduct = (product: Product) => {
    if (lines.some((l) => l.product.id === product.id)) {
      toast.info(`"${product.name}" đã có trong phiếu`);
      return;
    }
    setLines((prev) => [...prev, { product, value: "" }]);
  };

  const previews = lines.map((l) => previewLine(type, { current: l.product.quantity, value: l.value }));
  const reasonError = reason.trim().length < 3 ? "Lý do tối thiểu 3 ký tự" : null;
  const changed = previews.filter((p) => !p.error && p.change !== 0);
  const hasErrors = !!reasonError || lines.length === 0 || previews.some((p) => p.error) || changed.length === 0;

  const submit = () =>
    create.mutate(
      {
        type,
        reason: reason.trim(),
        note: note.trim() || null,
        items: lines
          .filter((_, i) => previews[i].change !== 0)
          .map((l) =>
            isStocktake
              ? { product_id: l.product.id, counted_quantity: Number(l.value) }
              : { product_id: l.product.id, quantity_change: Number(l.value) },
          ),
      },
      {
        onSuccess: (saved) => {
          toast.success(`Đã tạo phiếu ${saved.code}`);
          navigate(`/inventory/adjustments/${saved.id}`);
        },
        onError: (error) => {
          // Ví dụ NEGATIVE_STOCK: tồn kho vừa bị người khác thay đổi sau khi mở phiếu
          toast.error(toApiError(error).message);
          setConfirmOpen(false);
        },
      },
    );

  return (
    <>
      <PageHeader
        title={isStocktake ? "Kiểm kê kho" : "Điều chỉnh kho"}
        description={
          isStocktake
            ? "Nhập số lượng đếm thực tế. Hệ thống tự tính chênh lệch và chỉ ghi các sản phẩm bị lệch."
            : "Tăng hoặc giảm tồn kho kèm lý do (hư hỏng, thất lạc, sửa sai phiếu nhập…)."
        }
      />
      <div className="space-y-6">
        <Card>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <FormField label="Lý do" htmlFor="reason" required error={submitted ? (reasonError ?? undefined) : undefined}>
              <Input id="reason" value={reason} onChange={(e) => setReason(e.target.value)} invalid={submitted && !!reasonError} maxLength={255} />
            </FormField>
            <FormField label="Ghi chú" htmlFor="adj-note">
              <Textarea id="adj-note" rows={1} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
            </FormField>
          </CardContent>
        </Card>

        <Card>
          <CardHeader title="Sản phẩm" />
          <CardContent className="space-y-4">
            <ProductPicker onSelect={addProduct} activeOnly={false} label="Thêm sản phẩm vào phiếu" />
            {lines.length === 0 ? (
              <p className={cn("py-6 text-center text-sm", submitted ? "text-destructive" : "text-muted")}>Chưa có sản phẩm nào trong phiếu.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="text-left text-muted">
                    <tr className="border-b border-border">
                      <th className="py-2 pr-3 font-medium">Sản phẩm</th>
                      <th className="px-2 py-2 text-right font-medium">Tồn trên sổ</th>
                      <th className="w-40 px-2 py-2 text-right font-medium">{isStocktake ? "Số đếm thực tế" : "Thay đổi (+/−)"}</th>
                      <th className="px-2 py-2 text-right font-medium">{isStocktake ? "Chênh lệch" : "Tồn sau"}</th>
                      <th className="w-10" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {lines.map((line, index) => {
                      const preview = previews[index];
                      const showError = (submitted || line.value !== "") && preview.error;
                      return (
                        <tr key={line.product.id} className="align-top">
                          <td className="py-2 pr-3">
                            <span className="font-medium">{line.product.name}</span>
                            <span className="tabular block text-xs text-muted">{line.product.sku}</span>
                          </td>
                          <td className="tabular px-2 py-3 text-right">{formatNumber(line.product.quantity)}</td>
                          <td className="px-2 py-2">
                            <Input
                              aria-label={`${isStocktake ? "Số đếm" : "Thay đổi"} ${line.product.name}`}
                              inputMode={isStocktake ? "numeric" : "text"}
                              className="text-right tabular"
                              value={line.value}
                              invalid={!!showError}
                              onChange={(e) =>
                                setLines((prev) => prev.map((l, i) => (i === index ? { ...l, value: e.target.value } : l)))
                              }
                            />
                            {showError && <p className="text-right text-xs text-destructive">{preview.error}</p>}
                          </td>
                          <td className="tabular px-2 py-3 text-right font-medium">
                            <DiffCell change={preview.change} after={preview.after} isStocktake={isStocktake} />
                          </td>
                          <td className="py-2 text-right">
                            <Button variant="ghost" size="icon" aria-label={`Xóa ${line.product.name}`} onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-4">
            <p className="text-sm text-muted">
              {changed.length} sản phẩm sẽ được điều chỉnh
              {isStocktake && lines.length > changed.length && ` · ${lines.length - changed.length} sản phẩm khớp sổ hoặc chưa nhập`}
            </p>
            <div className="flex gap-2">
              <Link to="/inventory?tab=adjustments" className={buttonClass({ variant: "outline" })}>
                Hủy
              </Link>
              <Button
                onClick={() => {
                  setSubmitted(true);
                  if (!hasErrors) setConfirmOpen(true);
                  else if (lines.length > 0 && changed.length === 0 && !previews.some((p) => p.error)) toast.info("Không có chênh lệch nào cần điều chỉnh");
                }}
              >
                {isStocktake ? "Ghi nhận kiểm kê" : "Lưu điều chỉnh"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={isStocktake ? "Ghi nhận kết quả kiểm kê?" : "Lưu phiếu điều chỉnh?"}
        description={`Tồn kho của ${changed.length} sản phẩm sẽ được cập nhật ngay và ghi vào lịch sử kho. Phiếu không thể sửa sau khi lưu.`}
        confirmLabel="Xác nhận"
        loading={create.isPending}
        onConfirm={submit}
      />
    </>
  );
}
