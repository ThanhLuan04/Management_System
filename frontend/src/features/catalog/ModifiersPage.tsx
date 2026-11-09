import { Pencil, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { EmptyState, ErrorState, PageHeader } from "@/components/common/States";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Dialog } from "@/components/ui/Dialog";
import { FormField, Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Spinner";
import { useAuth } from "@/features/auth/AuthProvider";
import { P } from "@/features/auth/permissions";
import { toApiError } from "@/services/apiError";
import { formatMoney, formatNumber } from "@/utils/format";

import type { Product } from "./api";
import { formatDelta, type ModifierGroup, useModifierGroups, useSaveModifierGroup } from "./modifiers";
import { ProductPicker } from "./ProductPicker";

interface OptionDraft {
  id?: number;
  name: string;
  /** Chuỗi trong ô: "10000", "-5000" */
  price: string;
  ingredients: { id: number; name: string; unit: string; quantity: string }[];
}

function toDrafts(group: ModifierGroup | null): OptionDraft[] {
  if (!group) return [{ name: "", price: "0", ingredients: [] }];
  return group.options.map((o) => ({
    id: o.id,
    name: o.name,
    price: String(Math.round(Number(o.price_delta))),
    ingredients: o.ingredients.map((i) => ({ ...i.ingredient, quantity: String(i.quantity) })),
  }));
}

function rule(g: Pick<ModifierGroup, "min_select" | "max_select">) {
  if (g.min_select === 1 && g.max_select === 1) return "Bắt buộc chọn 1";
  if (g.min_select === 0) return `Không bắt buộc · tối đa ${g.max_select}`;
  return `Chọn ${g.min_select}–${g.max_select}`;
}

export function GroupDialog({ group, onClose }: { group: ModifierGroup | null; onClose: () => void }) {
  const save = useSaveModifierGroup(group?.id);
  const [name, setName] = useState(group?.name ?? "");
  const [min, setMin] = useState(String(group?.min_select ?? 0));
  const [max, setMax] = useState(String(group?.max_select ?? 1));
  const [active, setActive] = useState(group?.is_active ?? true);
  const [options, setOptions] = useState<OptionDraft[]>(() => toDrafts(group));
  const [error, setError] = useState<string | null>(null);

  const update = (index: number, change: Partial<OptionDraft>) =>
    setOptions((list) => list.map((o, i) => (i === index ? { ...o, ...change } : o)));

  const addIngredient = (index: number, product: Product) => {
    if (product.kind === "DISH") return toast.error("Chỉ dùng nguyên liệu hoặc hàng hóa có tồn kho");
    const option = options[index];
    if (option.ingredients.some((i) => i.id === product.id)) return;
    update(index, { ingredients: [...option.ingredients, { id: product.id, name: product.name, unit: product.unit, quantity: "" }] });
  };

  const submit = () => {
    const minN = Number(min);
    const maxN = Number(max);
    if (!name.trim()) return setError("Nhập tên nhóm, vd. Size, Topping");
    if (!/^\d+$/.test(min) || !/^\d+$/.test(max) || maxN < 1) return setError("Số lựa chọn tối thiểu ≥ 0, tối đa ≥ 1");
    if (minN > maxN) return setError("Tối thiểu không được lớn hơn tối đa");
    if (options.length === 0) return setError("Nhóm cần ít nhất một lựa chọn");
    if (minN > options.length) return setError("Tối thiểu lớn hơn số lựa chọn trong nhóm");
    const bad = options.find((o) => !o.name.trim() || !/^-?\d+$/.test(o.price) || o.ingredients.some((i) => !/^[1-9]\d{0,6}$/.test(i.quantity)));
    if (bad) return setError(`Kiểm tra lựa chọn "${bad.name || "(chưa đặt tên)"}": tên, giá (số đồng, có thể âm) và lượng nguyên liệu (số nguyên > 0)`);
    setError(null);
    save.mutate(
      {
        name: name.trim(),
        min_select: minN,
        max_select: maxN,
        is_active: active,
        options: options.map((o) => ({
          ...(o.id ? { id: o.id } : {}),
          name: o.name.trim(),
          price_delta: Number(o.price),
          ingredients: o.ingredients.map((i) => ({ ingredient_id: i.id, quantity: Number(i.quantity) })),
        })),
      },
      {
        onSuccess: () => {
          toast.success(group ? "Đã lưu nhóm tùy chọn" : "Đã tạo nhóm tùy chọn");
          onClose();
        },
        onError: (e) => {
          const apiError = toApiError(e);
          setError(Object.values(apiError.fieldErrors)[0] ?? apiError.message);
        },
      },
    );
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && !save.isPending && onClose()}
      title={group ? `Sửa nhóm: ${group.name}` : "Thêm nhóm tùy chọn"}
      description="Dùng chung cho nhiều món. Lựa chọn bị xóa khỏi nhóm chỉ ngừng dùng — đơn cũ vẫn giữ nguyên."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>
            Hủy
          </Button>
          <Button onClick={submit} loading={save.isPending}>
            Lưu
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-[1fr_7rem_7rem]">
          <FormField label="Tên nhóm" htmlFor="group-name" required>
            <Input id="group-name" value={name} maxLength={100} placeholder="vd. Size, Topping" onChange={(e) => setName(e.target.value)} />
          </FormField>
          <FormField label="Chọn tối thiểu" htmlFor="group-min" hint="0 = không bắt buộc">
            <Input id="group-min" inputMode="numeric" value={min} onChange={(e) => setMin(e.target.value.replace(/\D/g, "").slice(0, 2))} />
          </FormField>
          <FormField label="Chọn tối đa" htmlFor="group-max">
            <Input id="group-max" inputMode="numeric" value={max} onChange={(e) => setMax(e.target.value.replace(/\D/g, "").slice(0, 2))} />
          </FormField>
        </div>
        {group && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-primary" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Đang dùng (bỏ chọn để ẩn nhóm khỏi mọi món ở quầy)
          </label>
        )}

        <div className="space-y-3">
          <p className="text-sm font-semibold">Lựa chọn</p>
          {options.map((o, index) => (
            <div key={o.id ?? `new-${index}`} className="space-y-2 rounded-lg border border-border p-3">
              <div className="flex items-end gap-2">
                <FormField label="Tên lựa chọn" htmlFor={`option-name-${index}`}>
                  <Input id={`option-name-${index}`} value={o.name} maxLength={100} placeholder="vd. Lớn, Thêm trứng" onChange={(e) => update(index, { name: e.target.value })} />
                </FormField>
                <FormField label="Giá cộng thêm (₫)" htmlFor={`option-price-${index}`} hint="Âm = giảm giá">
                  <Input
                    id={`option-price-${index}`}
                    className="tabular w-32 text-right"
                    value={o.price}
                    onChange={(e) => update(index, { price: e.target.value.replace(/[^\d-]/g, "").replace(/(?!^)-/g, "").slice(0, 11) })}
                  />
                </FormField>
                <Button
                  variant="ghost"
                  size="icon"
                  className="mb-6"
                  aria-label={`Xóa lựa chọn ${o.name || index + 1}`}
                  onClick={() => setOptions((list) => list.filter((_, i) => i !== index))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              {o.ingredients.length > 0 && (
                <ul className="space-y-1 text-sm">
                  {o.ingredients.map((ing, ii) => (
                    <li key={ing.id} className="flex items-center gap-2">
                      <span className="flex-1">{ing.name}</span>
                      <Input
                        aria-label={`Lượng ${ing.name} cho ${o.name || "lựa chọn"}`}
                        inputMode="numeric"
                        className="tabular h-8 w-24 text-right"
                        value={ing.quantity}
                        onChange={(e) =>
                          update(index, {
                            ingredients: o.ingredients.map((x, xi) => (xi === ii ? { ...x, quantity: e.target.value.replace(/\D/g, "").slice(0, 7) } : x)),
                          })
                        }
                      />
                      <span className="w-10 text-muted">{ing.unit}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Bỏ ${ing.name}`}
                        onClick={() => update(index, { ingredients: o.ingredients.filter((_, xi) => xi !== ii) })}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              <ProductPicker
                onSelect={(p) => addIngredient(index, p)}
                label={`Nguyên liệu trừ thêm cho ${o.name || "lựa chọn"}`}
                placeholder="Nguyên liệu trừ thêm (không bắt buộc)"
                filter={{ stocked: true }}
              />
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => setOptions((list) => [...list, { name: "", price: "0", ingredients: [] }])}>
            <Plus className="h-4 w-4" aria-hidden /> Thêm lựa chọn
          </Button>
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}

export function ModifiersPage() {
  const { can } = useAuth();
  const canManage = can(P.CATALOG_MANAGE);
  const { data, error, isPending, refetch } = useModifierGroups();
  const [editing, setEditing] = useState<{ group: ModifierGroup | null } | null>(null);

  return (
    <>
      <PageHeader
        title="Tùy chọn món"
        description="Nhóm size, topping… dùng chung cho nhiều món. Gắn nhóm vào món ở trang chi tiết món."
        actions={
          canManage && (
            <Button onClick={() => setEditing({ group: null })}>
              <Plus className="h-4 w-4" aria-hidden /> Thêm nhóm
            </Button>
          )
        }
      />
      {error && !data ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : isPending ? (
        <Skeleton className="h-48" />
      ) : data.length === 0 ? (
        <Card>
          <EmptyState title="Chưa có nhóm tùy chọn" description="Ví dụ: Size (Vừa / Lớn +10.000 ₫), Topping (Thêm trứng +5.000 ₫)." />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.map((g) => (
            <Card key={g.id} role="region" aria-label={`Nhóm ${g.name}`} className="flex flex-col p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">
                    {g.name}
                    {!g.is_active && (
                      <Badge variant="muted" className="ml-2">
                        Ngừng dùng
                      </Badge>
                    )}
                  </p>
                  <p className="text-xs text-muted">
                    {rule(g)} · {formatNumber(g.dish_count)} món đang dùng
                  </p>
                </div>
                {canManage && (
                  <Button variant="ghost" size="icon" aria-label={`Sửa nhóm ${g.name}`} onClick={() => setEditing({ group: g })}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <ul className="mt-3 divide-y divide-border text-sm">
                {g.options.map((o) => (
                  <li key={o.id} className="py-1.5">
                    <span className="flex justify-between gap-2">
                      <span>{o.name}</span>
                      <span className="tabular text-muted">{formatDelta(o.price_delta, formatMoney)}</span>
                    </span>
                    {o.ingredients.length > 0 && (
                      <span className="block text-xs text-muted">
                        Trừ thêm: {o.ingredients.map((i) => `${formatNumber(i.quantity)} ${i.ingredient.unit} ${i.ingredient.name}`).join(", ")}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
      {editing && <GroupDialog group={editing.group} onClose={() => setEditing(null)} />}
    </>
  );
}
