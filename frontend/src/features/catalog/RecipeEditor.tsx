import { AlertTriangle, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { toApiError } from "@/services/apiError";
import { cn } from "@/utils/cn";
import { formatMoney, formatNumber, toNumber } from "@/utils/format";

import { type Product, type RecipeLine, useSaveRecipe } from "./api";
import { ProductPicker } from "./ProductPicker";

interface Row {
  ingredient: RecipeLine["ingredient"];
  /** Chuỗi trong ô nhập (số nguyên > 0 theo đơn vị kho của nguyên liệu) */
  quantity: string;
}

const toRows = (recipe: RecipeLine[]): Row[] => recipe.map((l) => ({ ingredient: l.ingredient, quantity: String(l.quantity) }));

/** % chi phí nguyên liệu (food cost) trên giá bán — quán ăn thường nhắm khoảng 30–40%. */
export function foodCostPercent(cost: number, salePrice: number): number | null {
  return salePrice > 0 ? Math.round((cost / salePrice) * 1000) / 10 : null;
}

/**
 * Công thức định lượng: 1 phần món cần bao nhiêu nguyên liệu (theo đơn vị kho của nguyên liệu: g, ml, cái).
 * Bán món sẽ trừ đúng các lượng này; giá vốn món = Σ(lượng × giá vốn bình quân nguyên liệu).
 */
export function RecipeEditor({ dish, canEdit }: { dish: Product; canEdit: boolean }) {
  const save = useSaveRecipe(dish.id);
  const [rows, setRows] = useState<Row[]>(() => toRows(dish.recipe));
  const [savedFrom, setSavedFrom] = useState(dish.recipe);
  const [error, setError] = useState<string | null>(null);

  // Dữ liệu máy chủ đổi (vừa lưu / người khác sửa) → nạp lại bảng
  if (savedFrom !== dish.recipe) {
    setSavedFrom(dish.recipe);
    setRows(toRows(dish.recipe));
  }

  const showCost = dish.avg_cost !== undefined;
  const lineCost = (row: Row) =>
    row.ingredient.avg_cost === undefined ? 0 : toNumber(row.ingredient.avg_cost) * (Number(row.quantity) || 0);
  const totalCost = rows.reduce((sum, row) => sum + lineCost(row), 0);
  const percent = foodCostPercent(totalCost, toNumber(dish.sale_price));
  const dirty =
    rows.length !== dish.recipe.length ||
    rows.some((row, i) => row.ingredient.id !== dish.recipe[i]?.ingredient.id || row.quantity !== String(dish.recipe[i]?.quantity));

  const add = (product: Product) => {
    if (product.kind === "DISH") return toast.error("Không dùng món ăn làm nguyên liệu của món khác");
    if (rows.some((r) => r.ingredient.id === product.id)) return toast.info(`${product.name} đã có trong công thức`);
    setRows((r) => [
      ...r,
      {
        ingredient: {
          id: product.id,
          sku: product.sku,
          name: product.name,
          unit: product.unit,
          kind: product.kind,
          is_active: product.is_active,
          quantity: product.quantity,
          ...(product.avg_cost !== undefined ? { avg_cost: product.avg_cost } : {}),
        },
        quantity: "",
      },
    ]);
  };

  const submit = () => {
    const invalid = rows.find((r) => !/^[1-9]\d{0,6}$/.test(r.quantity));
    if (invalid) return setError(`Nhập định lượng (số nguyên > 0, theo ${invalid.ingredient.unit}) cho ${invalid.ingredient.name}`);
    setError(null);
    save.mutate(
      rows.map((r) => ({ ingredient_id: r.ingredient.id, quantity: Number(r.quantity) })),
      {
        onSuccess: () => toast.success("Đã lưu công thức"),
        onError: (e) => setError(toApiError(e).message),
      },
    );
  };

  return (
    <Card>
      <CardHeader
        title="Công thức định lượng"
        description="Lượng nguyên liệu cho 1 phần. Bán món sẽ trừ kho đúng các lượng này."
        actions={
          canEdit && (
            <Button onClick={submit} loading={save.isPending} disabled={!dirty}>
              Lưu công thức
            </Button>
          )
        }
      />
      <CardContent className="space-y-4">
        {dish.recipe.length === 0 && !dirty && (
          <p role="status" className="flex items-center gap-2 rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning-strong">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
            Món chưa có công thức — chưa bán được ở quầy.
          </p>
        )}
        {rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Nguyên liệu cho 1 phần {dish.name}</caption>
              <thead className="border-b border-border text-left text-xs font-semibold text-muted">
                <tr>
                  <th className="py-2 pr-3">Nguyên liệu</th>
                  <th className="px-3 py-2 text-right">Định lượng / phần</th>
                  <th className="px-3 py-2 text-right">Tồn kho</th>
                  {showCost && <th className="px-3 py-2 text-right">Giá vốn</th>}
                  {canEdit && <th className="py-2 pl-3"><span className="sr-only">Xóa</span></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row, index) => (
                  <tr key={row.ingredient.id}>
                    <td className="py-2 pr-3">
                      <span className="font-medium">{row.ingredient.name}</span>
                      <span className="block text-xs text-muted">{row.ingredient.sku}{!row.ingredient.is_active && " · đã ngừng"}</span>
                    </td>
                    <td className="px-3 py-2">
                      {canEdit ? (
                        <span className="flex items-center justify-end gap-2">
                          <Input
                            aria-label={`Định lượng ${row.ingredient.name}`}
                            inputMode="numeric"
                            className="tabular w-24 text-right"
                            value={row.quantity}
                            onChange={(e) => {
                              const value = e.target.value.replace(/\D/g, "").slice(0, 7);
                              setRows((r) => r.map((x, i) => (i === index ? { ...x, quantity: value } : x)));
                            }}
                          />
                          <span className="w-8 text-muted">{row.ingredient.unit}</span>
                        </span>
                      ) : (
                        <span className="tabular block text-right">{formatNumber(Number(row.quantity))} {row.ingredient.unit}</span>
                      )}
                    </td>
                    <td className={cn("tabular px-3 py-2 text-right", row.ingredient.quantity < (Number(row.quantity) || 0) && "font-medium text-destructive-strong")}>
                      {formatNumber(row.ingredient.quantity)} {row.ingredient.unit}
                    </td>
                    {showCost && <td className="tabular px-3 py-2 text-right">{formatMoney(lineCost(row))}</td>}
                    {canEdit && (
                      <td className="py-2 pl-3 text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Bỏ ${row.ingredient.name} khỏi công thức`}
                          onClick={() => setRows((r) => r.filter((_, i) => i !== index))}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {canEdit && <ProductPicker onSelect={add} label="Thêm nguyên liệu" placeholder="Tìm nguyên liệu theo tên / SKU" filter={{ stocked: true }} />}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

        <dl className="grid gap-3 border-t border-border pt-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-muted">Còn làm được</dt>
            <dd className="tabular mt-0.5 text-lg font-semibold">{formatNumber(dish.quantity)} {dish.unit}</dd>
          </div>
          {showCost && (
            <>
              <div>
                <dt className="text-xs text-muted">Giá vốn ước tính / phần</dt>
                <dd className="tabular mt-0.5 text-lg font-semibold">{formatMoney(totalCost)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Chi phí nguyên liệu / giá bán</dt>
                <dd
                  className={cn(
                    "tabular mt-0.5 text-lg font-semibold",
                    percent !== null && percent > 40 && "text-warning-strong",
                  )}
                >
                  {percent === null ? "—" : `${String(percent).replace(".", ",")}%`}
                </dd>
              </div>
            </>
          )}
        </dl>
        {showCost && (
          <p className="text-xs text-muted">
            Giá vốn theo giá nhập bình quân hiện tại của nguyên liệu; mỗi đơn chốt giá vốn tại lúc bán. Quán ăn thường giữ chi phí nguyên liệu khoảng 30–40% giá bán.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
