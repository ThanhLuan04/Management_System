import { Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Input } from "@/components/ui/Input";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { cn } from "@/utils/cn";

/** Ô tìm kiếm cho danh sách: hiển thị ngay khi gõ, chỉ báo thay đổi khi ngừng gõ 300ms. */
export function SearchInput({
  value,
  onSearch,
  placeholder,
  label,
  className,
}: {
  value: string;
  onSearch: (value: string | undefined) => void;
  placeholder: string;
  label: string;
  className?: string;
}) {
  const [text, setText] = useState(value);
  const debounced = useDebouncedValue(text);
  const lastSent = useRef(value);

  // Đồng bộ khi bộ lọc bị xóa từ bên ngoài (nút "Xóa bộ lọc")
  useEffect(() => {
    if (value !== lastSent.current) {
      lastSent.current = value;
      setText(value);
    }
  }, [value]);

  useEffect(() => {
    if (debounced !== lastSent.current) {
      lastSent.current = debounced;
      onSearch(debounced.trim() || undefined);
    }
  }, [debounced, onSearch]);

  return (
    <div className={cn("relative min-w-60 flex-1", className)}>
      <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
      <Input
        type="search"
        placeholder={placeholder}
        aria-label={label}
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="pl-9"
      />
    </div>
  );
}
