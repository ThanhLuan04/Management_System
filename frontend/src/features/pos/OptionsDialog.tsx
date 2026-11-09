import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import type { ModifierGroupRef, ModifierOptionRef, Product } from "@/features/catalog/api";
import { cn } from "@/utils/cn";
import { formatMoney, toNumber } from "@/utils/format";

/** Mặc định: nhóm bắt buộc chọn đúng 1 (vd. Size) chọn sẵn lựa chọn đầu tiên. */
export function defaultSelection(groups: ModifierGroupRef[]): Record<number, number[]> {
  return Object.fromEntries(
    groups.map((g) => [g.id, g.min_select >= 1 && g.max_select === 1 && g.options[0] ? [g.options[0].id] : []]),
  );
}

/** Lỗi theo nhóm (thiếu / quá số lựa chọn) — cùng quy tắc với máy chủ. */
export function selectionErrors(groups: ModifierGroupRef[], selected: Record<number, number[]>): Record<number, string> {
  const errors: Record<number, string> = {};
  for (const g of groups) {
    const count = selected[g.id]?.length ?? 0;
    if (count < g.min_select) errors[g.id] = g.min_select === 1 ? `Chọn ${g.name}` : `Chọn ít nhất ${g.min_select}`;
    else if (count > g.max_select) errors[g.id] = `Chọn tối đa ${g.max_select}`;
  }
  return errors;
}

function priceLabel(delta: string) {
  const value = toNumber(delta);
  if (value === 0) return "";
  return value > 0 ? `+${formatMoney(value)}` : `−${formatMoney(-value)}`;
}

function rule(g: ModifierGroupRef) {
  if (g.min_select === 1 && g.max_select === 1) return "Bắt buộc chọn 1";
  if (g.min_select === 0) return `Tùy chọn, tối đa ${g.max_select}`;
  return `Chọn ${g.min_select}–${g.max_select}`;
}

/**
 * Bấm món có tùy chọn ở quầy → chọn size / topping rồi mới thêm vào giỏ.
 * Nhóm chọn 1 hiện dạng radio, nhóm chọn nhiều hiện dạng checkbox (khóa khi đã đủ số tối đa).
 */
export function OptionsDialog({
  product,
  onClose,
  onConfirm,
}: {
  product: Product;
  onClose: () => void;
  onConfirm: (options: ModifierOptionRef[]) => void;
}) {
  const groups = product.modifier_groups;
  const [selected, setSelected] = useState(() => defaultSelection(groups));
  const [submitted, setSubmitted] = useState(false);
  const errors = selectionErrors(groups, selected);
  const options = groups.flatMap((g) => g.options.filter((o) => selected[g.id]?.includes(o.id)));
  const total = toNumber(product.sale_price) + options.reduce((s, o) => s + toNumber(o.price_delta), 0);

  const toggle = (g: ModifierGroupRef, optionId: number) =>
    setSelected((s) => {
      const current = s[g.id] ?? [];
      if (g.max_select === 1) return { ...s, [g.id]: current.includes(optionId) && g.min_select === 0 ? [] : [optionId] };
      return { ...s, [g.id]: current.includes(optionId) ? current.filter((id) => id !== optionId) : [...current, optionId] };
    });

  const confirm = () => {
    setSubmitted(true);
    if (Object.keys(errors).length > 0) return;
    onConfirm(options);
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={product.name}
      description={`Giá gốc ${formatMoney(product.sale_price)}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Hủy
          </Button>
          <Button onClick={confirm}>Thêm vào giỏ · {formatMoney(Math.max(total, 0))}</Button>
        </>
      }
    >
      <div className="space-y-5">
        {groups.map((g) => {
          const picked = selected[g.id] ?? [];
          const single = g.max_select === 1;
          return (
            <fieldset key={g.id}>
              <legend className="mb-2 flex w-full items-baseline justify-between gap-2">
                <span className="font-semibold">{g.name}</span>
                <span className="text-xs text-muted">{rule(g)}</span>
              </legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {g.options.map((o) => {
                  const checked = picked.includes(o.id);
                  const full = !single && !checked && picked.length >= g.max_select;
                  return (
                    <label
                      key={o.id}
                      className={cn(
                        "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm",
                        checked ? "border-primary bg-primary-soft" : "border-border",
                        full && "cursor-not-allowed opacity-50",
                      )}
                    >
                      <input
                        type={single ? "radio" : "checkbox"}
                        name={`group-${g.id}`}
                        className="h-4 w-4 accent-primary"
                        checked={checked}
                        disabled={full}
                        onChange={() => toggle(g, o.id)}
                        onClick={() => single && checked && g.min_select === 0 && toggle(g, o.id)}
                      />
                      <span className="flex-1">{o.name}</span>
                      <span className="tabular text-xs text-muted">{priceLabel(o.price_delta)}</span>
                    </label>
                  );
                })}
              </div>
              {submitted && errors[g.id] && (
                <p role="alert" className="mt-1 text-sm text-destructive">
                  {errors[g.id]}
                </p>
              )}
            </fieldset>
          );
        })}
      </div>
    </Dialog>
  );
}
