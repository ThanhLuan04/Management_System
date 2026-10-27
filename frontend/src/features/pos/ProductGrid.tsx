import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { EmptyState } from "@/components/common/States";
import { Skeleton } from "@/components/ui/Spinner";
import { type Product, useCategoryTree } from "@/features/catalog/api";
import { ProductThumb } from "@/features/catalog/components";
import { http } from "@/services/http";
import type { Page } from "@/types/api";
import { cn } from "@/utils/cn";
import { formatMoney, formatNumber } from "@/utils/format";

// Tối đa backend cho phép một lần; cửa hàng nhiều hơn thì dùng ô tìm kiếm / lọc danh mục
const GRID_LIMIT = 100;

/**
 * Lưới sản phẩm đang bán ở màn hình POS: hiện sẵn, lọc theo danh mục, bấm để thêm vào giỏ.
 * Ô tìm kiếm / máy quét mã vạch (ProductPicker) vẫn là cách nhanh nhất khi biết sản phẩm.
 */
export function ProductGrid({ onSelect, inCart }: { onSelect: (product: Product) => void; inCart: Record<number, number> }) {
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const { data: tree } = useCategoryTree();
  const roots = (tree ?? []).filter((c) => c.is_active);

  const { data, isPending } = useQuery({
    queryKey: ["products", "pos-grid", categoryId],
    queryFn: async () =>
      (
        await http.get<Page<Product>>("/products", {
          params: { is_active: true, sort: "name", page_size: GRID_LIMIT, ...(categoryId ? { category_id: categoryId } : {}) },
        })
      ).data,
    staleTime: 10_000,
  });

  const chip = (id: number | null, label: string) => (
    <button
      key={id ?? "all"}
      type="button"
      role="radio"
      aria-checked={categoryId === id}
      onClick={() => setCategoryId(id)}
      className={cn(
        "shrink-0 rounded-full border px-3 py-1 text-sm whitespace-nowrap transition-colors",
        categoryId === id
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card text-muted hover:bg-surface-muted hover:text-foreground",
      )}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label="Lọc theo danh mục" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {chip(null, "Tất cả")}
        {roots.map((c) => chip(c.id, c.name))}
      </div>

      {isPending ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-36" />
          ))}
        </div>
      ) : !data || data.items.length === 0 ? (
        <EmptyState title="Không có sản phẩm đang bán trong danh mục này" />
      ) : (
        <>
          <ul aria-label="Sản phẩm" className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {data.items.map((product) => {
              const out = product.quantity <= 0;
              const count = inCart[product.id] ?? 0;
              return (
                <li key={product.id}>
                  <button
                    type="button"
                    disabled={out}
                    onClick={() => onSelect(product)}
                    aria-label={`Thêm ${product.name}, ${formatMoney(product.sale_price)}, ${out ? "hết hàng" : `còn ${formatNumber(product.quantity)} ${product.unit}`}`}
                    className={cn(
                      "relative flex h-full w-full flex-col items-start gap-2 rounded-xl border border-border bg-card p-3 text-left transition",
                      "hover:border-primary/50 hover:shadow-card focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none",
                      "active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:border-border disabled:hover:shadow-none",
                      count > 0 && "border-primary/60 bg-primary-soft",
                    )}
                  >
                    {count > 0 && (
                      <span className="absolute top-2 right-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground">
                        {count}
                      </span>
                    )}
                    <ProductThumb url={product.image_url} name={product.name} className="h-11 w-11" />
                    <span className="line-clamp-2 min-h-10 text-sm leading-5 font-medium">{product.name}</span>
                    <span className="mt-auto flex w-full items-baseline justify-between gap-2">
                      <span className="tabular font-semibold">{formatMoney(product.sale_price)}</span>
                      <span className={cn("tabular text-xs", out ? "font-medium text-destructive-strong" : product.is_low_stock ? "text-warning-strong" : "text-muted")}>
                        {out ? "Hết hàng" : `còn ${formatNumber(product.quantity)}`}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {data.total > data.items.length && (
            <p className="text-center text-xs text-muted">
              Đang hiện {formatNumber(data.items.length)}/{formatNumber(data.total)} sản phẩm — chọn danh mục hoặc gõ tên vào ô tìm kiếm để tìm sản phẩm khác.
            </p>
          )}
        </>
      )}
    </div>
  );
}
