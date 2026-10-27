import { useQuery } from "@tanstack/react-query";
import { UserPlus, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { Customer } from "@/features/partners/api";
import { CustomerDialog } from "@/features/partners/CustomerDialog";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { http } from "@/services/http";
import type { Page } from "@/types/api";

/** Chọn khách hàng tại quầy: tìm theo SĐT/tên, hoặc thêm nhanh khách mới. Để trống = khách lẻ. */
export function CustomerSelect({ value, onChange }: { value: Customer | null; onChange: (customer: Customer | null) => void }) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const query = useDebouncedValue(text.trim(), 250);

  const { data: results = [] } = useQuery({
    queryKey: ["customers", "pos-search", query],
    queryFn: async () =>
      (await http.get<Page<Customer>>("/customers", { params: { q: query, page_size: 6, is_active: true } })).data.items,
    enabled: query.length >= 2,
  });

  if (value) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-slate-50 px-3 py-2 text-sm">
        <span className="min-w-0">
          <span className="block truncate font-medium">{value.name}</span>
          <span className="tabular text-xs text-muted">
            {value.code}
            {value.phone && ` · ${value.phone}`}
          </span>
        </span>
        <Button variant="ghost" size="icon" onClick={() => onChange(null)} aria-label="Bỏ chọn khách hàng">
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  const digits = text.replace(/\D/g, "");
  return (
    <div className="relative">
      <div className="flex gap-2">
        <Input
          aria-label="Tìm khách hàng"
          placeholder="Khách lẻ — gõ SĐT hoặc tên để tìm"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
        <Button variant="outline" size="icon" onClick={() => setCreating(true)} aria-label="Thêm khách hàng mới">
          <UserPlus className="h-4 w-4" />
        </Button>
      </div>
      {open && query.length >= 2 && (
        <ul role="listbox" aria-label="Khách hàng" className="absolute z-20 mt-1 w-full rounded-md border border-border bg-card py-1 text-sm shadow-lg">
          {results.length === 0 && (
            <li className="px-3 py-2 text-muted">
              Không tìm thấy.{" "}
              <button type="button" className="text-primary hover:underline" onMouseDown={(e) => e.preventDefault()} onClick={() => setCreating(true)}>
                Thêm khách mới
              </button>
            </li>
          )}
          {results.map((c) => (
            <li
              key={c.id}
              role="option"
              aria-selected={false}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(c);
                setText("");
                setOpen(false);
              }}
              className="cursor-pointer px-3 py-2 hover:bg-slate-100"
            >
              <span className="font-medium">{c.name}</span>
              <span className="tabular ml-2 text-xs text-muted">{c.phone ?? c.code}</span>
            </li>
          ))}
        </ul>
      )}
      <CustomerDialog
        open={creating}
        onOpenChange={setCreating}
        editing={null}
        initialPhone={digits.length >= 9 ? text.trim() : undefined}
        onSaved={(customer) => {
          onChange(customer);
          setText("");
        }}
      />
    </div>
  );
}
