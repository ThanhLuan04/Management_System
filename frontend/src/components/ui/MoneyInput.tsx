import { Input, type InputProps } from "./Input";

const grouping = new Intl.NumberFormat("vi-VN");

interface MoneyInputProps extends Omit<InputProps, "value" | "onChange" | "type"> {
  /** Giá trị dạng chuỗi chỉ gồm chữ số ("32000"), rỗng nếu chưa nhập. */
  value: string;
  onChange: (digits: string) => void;
}

/** Ô nhập tiền VND: hiển thị "32.000", lưu "32000". Chỉ nhận số nguyên (đơn vị đồng). */
export function MoneyInput({ value, onChange, ...props }: MoneyInputProps) {
  const display = value === "" ? "" : grouping.format(Number(value));
  return (
    <div className="relative">
      <Input
        {...props}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={display}
        onChange={(event) => onChange(event.target.value.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, 13))}
        className="pr-8 text-right tabular"
      />
      <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted">₫</span>
    </div>
  );
}
