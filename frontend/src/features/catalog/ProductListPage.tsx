import { Plus, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";

import { type Column, DataTable, Pagination } from "@/components/common/DataTable";
import { PageHeader } from "@/components/common/States";
import { Button, buttonClass } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useAuth } from "@/features/auth/AuthProvider";
import { P } from "@/features/auth/permissions";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useListParams } from "@/hooks/useListParams";
import { formatMoney } from "@/utils/format";

import { flattenCategories, type Product, useCategoryTree, useProducts } from "./api";
import { ActiveBadge, ProductThumb, StockCell } from "./components";

export function ProductListPage() {
  const { can } = useAuth();
  const canManage = can(P.CATALOG_MANAGE);
  const list = useListParams("-created_at");
  const { filters } = list.state;

  // Ô tìm kiếm: hiển thị ngay khi gõ, chỉ gọi API khi ngừng gõ 300ms
  const [search, setSearch] = useState(filters.q ?? "");
  const debouncedSearch = useDebouncedValue(search);
  useEffect(() => {
    // Chỉ phản ứng khi giá trị đã debounce đổi; filters/list đọc giá trị mới nhất tại thời điểm đó
    if ((filters.q ?? "") !== debouncedSearch) list.setFilter("q", debouncedSearch || undefined);
  }, [debouncedSearch]);

  const { data, error, isPending, isFetching, refetch } = useProducts(list.apiParams);
  const { data: categoryTree } = useCategoryTree();

  const columns: Column<Product>[] = [
    { key: "image", header: <span className="sr-only">Ảnh</span>, cell: (p) => <ProductThumb url={p.image_url} name={p.name} /> },
    {
      key: "sku",
      header: "SKU",
      sortKey: "sku",
      cell: (p) => <span className="tabular font-medium">{p.sku}</span>,
    },
    {
      key: "name",
      header: "Tên sản phẩm",
      sortKey: "name",
      className: "min-w-56",
      cell: (p) => (
        <Link to={`/products/${p.id}`} className="font-medium hover:text-primary hover:underline">
          {p.name}
          {p.brand && <span className="block text-xs font-normal text-muted">{p.brand.name}</span>}
        </Link>
      ),
    },
    { key: "category", header: "Danh mục", cell: (p) => p.category.name },
    {
      key: "price",
      header: "Giá bán",
      sortKey: "sale_price",
      align: "right",
      cell: (p) => <span className="tabular">{formatMoney(p.sale_price)}</span>,
    },
    {
      key: "stock",
      header: "Tồn",
      sortKey: "quantity",
      align: "right",
      cell: (p) => <StockCell quantity={p.quantity} isLow={p.is_low_stock} />,
    },
    { key: "status", header: "Trạng thái", cell: (p) => <ActiveBadge active={p.is_active} /> },
    ...(canManage
      ? [
          {
            key: "actions",
            header: <span className="sr-only">Thao tác</span>,
            align: "right" as const,
            cell: (p: Product) => (
              <Link to={`/products/${p.id}/edit`} className="text-sm text-primary hover:underline">
                Sửa
              </Link>
            ),
          },
        ]
      : []),
  ];

  return (
    <>
      <PageHeader
        title="Sản phẩm"
        description="Tồn kho chỉ thay đổi qua nhập hàng, bán hàng, trả hàng và điều chỉnh kho."
        actions={
          canManage && (
            <Link to="/products/new" className={buttonClass()}>
              <Plus className="h-4 w-4" aria-hidden /> Thêm sản phẩm
            </Link>
          )
        }
      />

      <Card>
        <div className="flex flex-wrap gap-3 border-b border-border p-4">
          <div className="relative min-w-60 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
            <Input
              type="search"
              placeholder="Tìm theo tên, SKU hoặc mã vạch…"
              aria-label="Tìm sản phẩm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select
            aria-label="Lọc theo danh mục"
            value={filters.category_id ?? ""}
            onChange={(e) => list.setFilter("category_id", e.target.value || undefined)}
            className="w-56"
          >
            <option value="">Tất cả danh mục</option>
            {flattenCategories(categoryTree).map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Lọc theo trạng thái"
            value={filters.is_active ?? ""}
            onChange={(e) => list.setFilter("is_active", e.target.value || undefined)}
            className="w-44"
          >
            <option value="">Mọi trạng thái</option>
            <option value="true">Đang bán</option>
            <option value="false">Ngừng kinh doanh</option>
          </Select>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 accent-primary"
              checked={filters.low_stock === "true"}
              onChange={(e) => list.setFilter("low_stock", e.target.checked ? "true" : undefined)}
            />
            Chỉ hàng sắp hết
          </label>
        </div>

        <DataTable
          caption="Danh sách sản phẩm"
          columns={columns}
          rows={data?.items}
          rowKey={(p) => p.id}
          isPending={isPending}
          isFetching={isFetching}
          error={error}
          onRetry={() => refetch()}
          sort={list.state.sort}
          onSort={list.setSort}
          emptyTitle={Object.keys(filters).length ? "Không có sản phẩm phù hợp bộ lọc" : "Chưa có sản phẩm"}
          emptyAction={
            Object.keys(filters).length ? (
              <Button variant="outline" size="sm" onClick={() => { setSearch(""); list.reset(); }}>
                Xóa bộ lọc
              </Button>
            ) : (
              canManage && (
                <Link to="/products/new" className={buttonClass({ size: "sm" })}>
                  Thêm sản phẩm
                </Link>
              )
            )
          }
        />
        {data && data.total > 0 && (
          <Pagination
            page={data.page}
            pageSize={data.page_size}
            total={data.total}
            onPageChange={list.setPage}
            onPageSizeChange={list.setPageSize}
          />
        )}
      </Card>
    </>
  );
}
