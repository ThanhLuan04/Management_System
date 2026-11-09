import { useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";

import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { toApiError } from "@/services/apiError";
import { formatMoney } from "@/utils/format";

import type { Product } from "./api";
import { formatDelta, useModifierGroups, useSetProductModifiers } from "./modifiers";

/** Chọn các nhóm tùy chọn (size, topping) cho món. Thứ tự tích chọn = thứ tự hiện ở quầy. */
export function ProductModifiersCard({ dish, canEdit }: { dish: Product; canEdit: boolean }) {
  const groups = useModifierGroups();
  const save = useSetProductModifiers(dish.id);
  const current = dish.modifier_groups.map((g) => g.id);
  const [selected, setSelected] = useState<number[]>(current);
  const [savedFrom, setSavedFrom] = useState(dish.modifier_groups);

  if (savedFrom !== dish.modifier_groups) {
    setSavedFrom(dish.modifier_groups);
    setSelected(dish.modifier_groups.map((g) => g.id));
  }

  const dirty = selected.join(",") !== current.join(",");
  const active = (groups.data ?? []).filter((g) => g.is_active);

  const submit = () =>
    save.mutate(selected, {
      onSuccess: () => toast.success("Đã lưu tùy chọn của món"),
      onError: (e) => toast.error(toApiError(e).message),
    });

  return (
    <Card>
      <CardHeader
        title="Tùy chọn món"
        description="Khách chọn ở quầy: size, topping… Giá và nguyên liệu của lựa chọn được cộng vào món."
        actions={
          canEdit && (
            <Button onClick={submit} loading={save.isPending} disabled={!dirty}>
              Lưu tùy chọn
            </Button>
          )
        }
      />
      <CardContent className="space-y-3">
        {!canEdit ? (
          dish.modifier_groups.length === 0 ? (
            <p className="text-sm text-muted">Món không có tùy chọn.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {dish.modifier_groups.map((g) => (
                <li key={g.id}>
                  <span className="font-medium">{g.name}:</span> {g.options.map((o) => o.name).join(", ")}
                </li>
              ))}
            </ul>
          )
        ) : groups.isPending ? (
          <p className="text-sm text-muted">Đang tải nhóm tùy chọn…</p>
        ) : active.length === 0 ? (
          <p className="text-sm text-muted">
            Chưa có nhóm tùy chọn nào —{" "}
            <Link to="/modifiers" className="text-primary hover:underline">
              tạo nhóm (vd. Size, Topping)
            </Link>
            .
          </p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {active.map((g) => {
              const order = selected.indexOf(g.id);
              return (
                <li key={g.id}>
                  <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-border p-3 text-sm">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 accent-primary"
                      checked={order >= 0}
                      onChange={() => setSelected((s) => (s.includes(g.id) ? s.filter((id) => id !== g.id) : [...s, g.id]))}
                    />
                    <span className="flex-1">
                      <span className="font-medium">
                        {order >= 0 && <span className="tabular mr-1 text-primary">{order + 1}.</span>}
                        {g.name}
                      </span>
                      <span className="block text-xs text-muted">
                        {g.options.map((o) => `${o.name}${formatDelta(o.price_delta, formatMoney) ? ` ${formatDelta(o.price_delta, formatMoney)}` : ""}`).join(" · ")}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
