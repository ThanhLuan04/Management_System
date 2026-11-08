import { useRef, useState } from "react";

import { Input, type InputProps } from "./Input";

const grouping = new Intl.NumberFormat("vi-VN");

interface MoneyInputProps extends Omit<InputProps, "value" | "onChange" | "type"> {
  /** Giá trị dạng chuỗi chỉ gồm chữ số ("32000"), rỗng nếu chưa nhập. */
  value: string;
  onChange: (digits: string) => void;
}

function digitsOf(text: string): string {
  return text.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, 13);
}

/**
 * Ô nhập tiền VND: lưu "32000", hiển thị "32.000" khi KHÔNG đang gõ.
 *
 * Khi đang gõ chỉ hiện đúng các chữ số người dùng gõ (không chèn dấu chấm, không làm nhảy con trỏ):
 * bộ gõ tiếng Việt (Telex/VNI của Windows, Unikey, EVKey) theo dõi từng ký tự đã gõ — nếu ô tự sửa chữ giữa chừng,
 * bộ gõ bị lệch và gõ lặp ký tự (vd. gõ 15000 ra 115000). Trong lúc bộ gõ đang "ghép chữ" (composition)
 * cũng không xử lý, chờ ghép xong mới lấy giá trị.
 */
export function MoneyInput({ value, onChange, onFocus, onBlur, ...props }: MoneyInputProps) {
  const [editing, setEditing] = useState(false);
  const composing = useRef(false);
  // Chữ thô trong lúc bộ gõ đang ghép (chưa phải giá trị cuối)
  const [draft, setDraft] = useState<string | null>(null);

  const display = draft ?? (value === "" ? "" : editing ? value : grouping.format(Number(value)));

  return (
    <div className="relative">
      <Input
        {...props}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={display}
        onFocus={(event) => {
          setEditing(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setEditing(false);
          setDraft(null);
          onBlur?.(event);
        }}
        onCompositionStart={() => {
          composing.current = true;
        }}
        onCompositionEnd={(event) => {
          composing.current = false;
          setDraft(null);
          onChange(digitsOf(event.currentTarget.value));
        }}
        onChange={(event) => {
          if (composing.current) {
            setDraft(event.target.value);
            return;
          }
          onChange(digitsOf(event.target.value));
        }}
        className="pr-8 text-right tabular"
      />
      <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted">₫</span>
    </div>
  );
}
