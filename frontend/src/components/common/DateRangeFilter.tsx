import { Input } from "@/components/ui/Input";

/** Bộ lọc khoảng ngày (YYYY-MM-DD, theo giờ VN phía backend). Rỗng = không giới hạn. */
export function DateRangeFilter({
  from,
  to,
  onChange,
}: {
  from?: string;
  to?: string;
  onChange: (key: "date_from" | "date_to", value: string | undefined) => void;
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <Input
        type="date"
        aria-label="Từ ngày"
        value={from ?? ""}
        max={to}
        onChange={(e) => onChange("date_from", e.target.value || undefined)}
        className="w-40"
      />
      <span className="text-muted">→</span>
      <Input
        type="date"
        aria-label="Đến ngày"
        value={to ?? ""}
        min={from}
        onChange={(e) => onChange("date_to", e.target.value || undefined)}
        className="w-40"
      />
    </div>
  );
}
