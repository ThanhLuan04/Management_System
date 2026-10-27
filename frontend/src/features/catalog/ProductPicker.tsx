import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useId, useRef, useState } from "react";

import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { http } from "@/services/http";
import type { Page } from "@/types/api";
import { cn } from "@/utils/cn";
import { formatMoney, formatNumber } from "@/utils/format";

import type { Product } from "./api";
import { ProductThumb } from "./components";

interface ProductPickerProps {
  onSelect: (product: Product) => void;
  placeholder?: string;
  /** Chỉ sản phẩm đang kinh doanh (mặc định) */
  activeOnly?: boolean;
  autoFocus?: boolean;
  label?: string;
}

/**
 * Ô tìm & chọn sản phẩm (combobox): gõ tên/SKU/mã vạch, ↑↓ để di chuyển, Enter để chọn, Esc để đóng.
 * Máy quét mã vạch gõ mã rồi Enter → nếu mã khớp đúng một sản phẩm thì chọn luôn.
 */
export function ProductPicker({ onSelect, placeholder, activeOnly = true, autoFocus, label = "Tìm sản phẩm" }: ProductPickerProps) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const query = useDebouncedValue(text.trim(), 200);

  const { data, isFetching } = useQuery({
    queryKey: ["products", "picker", query, activeOnly],
    queryFn: async () =>
      (
        await http.get<Page<Product>>("/products", {
          params: { q: query, page_size: 8, sort: "name", ...(activeOnly ? { is_active: true } : {}) },
        })
      ).data.items,
    enabled: query.length > 0,
    staleTime: 10_000,
  });
  const results = query.length > 0 ? (data ?? []) : [];

  const choose = (product: Product) => {
    onSelect(product);
    setText("");
    setOpen(false);
    setHighlight(0);
    inputRef.current?.focus();
  };

  const onKeyDown = async (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.min(h + 1, Math.max(results.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (event.key === "Escape") {
      setOpen(false);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const typed = text.trim();
      if (!typed) return;
      // Kết quả đang hiển thị khớp với chữ vừa gõ → chọn dòng đang sáng
      if (open && query === typed && results[highlight]) {
        choose(results[highlight]);
        return;
      }
      // Máy quét gõ nhanh hơn debounce: tra cứu ngay, chỉ tự chọn khi khớp chính xác SKU/mã vạch
      const items = (
        await http.get<Page<Product>>("/products", { params: { q: typed, page_size: 8, ...(activeOnly ? { is_active: true } : {}) } })
      ).data.items;
      const exact = items.find((p) => p.barcode === typed || p.sku === typed.toUpperCase());
      if (exact) choose(exact);
      else setOpen(true);
    }
  };

  const showList = open && query.length > 0;

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
      <Input
        ref={inputRef}
        role="combobox"
        aria-label={label}
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && results[highlight] ? `${listId}-${results[highlight].id}` : undefined}
        autoFocus={autoFocus}
        placeholder={placeholder ?? "Gõ tên, SKU hoặc quét mã vạch…"}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
          setHighlight(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={onKeyDown}
        className="pl-9"
      />
      {isFetching && <Spinner className="absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-muted" />}
      {showList && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Kết quả tìm sản phẩm"
          className="absolute z-20 mt-1 max-h-80 w-full overflow-y-auto rounded-md border border-border bg-card py-1 shadow-lg"
        >
          {results.length === 0 && !isFetching && <li className="px-3 py-2 text-sm text-muted">Không tìm thấy sản phẩm</li>}
          {results.map((product, index) => (
            <li
              key={product.id}
              id={`${listId}-${product.id}`}
              role="option"
              aria-selected={index === highlight}
              onMouseDown={(e) => e.preventDefault()} // giữ focus ở ô nhập
              onMouseEnter={() => setHighlight(index)}
              onClick={() => choose(product)}
              className={cn("flex cursor-pointer items-center gap-3 px-3 py-2 text-sm", index === highlight && "bg-slate-100")}
            >
              <ProductThumb url={product.image_url} name={product.name} className="h-8 w-8" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{product.name}</span>
                <span className="tabular text-xs text-muted">
                  {product.sku} · tồn {formatNumber(product.quantity)} {product.unit}
                </span>
              </span>
              <span className="tabular text-sm">{formatMoney(product.sale_price)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
