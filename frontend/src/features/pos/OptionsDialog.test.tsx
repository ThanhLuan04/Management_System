import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { ModifierGroupRef, Product } from "@/features/catalog/api";

import { defaultSelection, OptionsDialog, selectionErrors } from "./OptionsDialog";

const SIZE: ModifierGroupRef = {
  id: 1,
  name: "Size",
  min_select: 1,
  max_select: 1,
  options: [
    { id: 10, name: "Vừa", price_delta: "0.00" },
    { id: 11, name: "Lớn", price_delta: "10000.00" },
  ],
};
const TOPPING: ModifierGroupRef = {
  id: 2,
  name: "Topping",
  min_select: 0,
  max_select: 2,
  options: [
    { id: 20, name: "Thêm trứng", price_delta: "5000.00" },
    { id: 21, name: "Thêm thịt", price_delta: "15000.00" },
    { id: 22, name: "Không hành", price_delta: "0.00" },
  ],
};
const PHO = { id: 9, name: "Phở bò", sale_price: "50000.00", kind: "DISH", modifier_groups: [SIZE, TOPPING] } as Product;

describe("OptionsDialog", () => {
  it("preselects the first size, adds option prices and returns the chosen options", async () => {
    const onConfirm = vi.fn();
    render(<OptionsDialog product={PHO} onClose={vi.fn()} onConfirm={onConfirm} />);

    expect(screen.getByRole("radio", { name: /Vừa/ })).toBeChecked();
    await userEvent.click(screen.getByRole("radio", { name: /Lớn/ }));
    await userEvent.click(screen.getByRole("checkbox", { name: /Thêm trứng/ }));
    await userEvent.click(screen.getByRole("checkbox", { name: /Thêm thịt/ }));

    expect(screen.getByRole("checkbox", { name: /Không hành/ })).toBeDisabled(); // đã đủ tối đa 2
    await userEvent.click(screen.getByRole("button", { name: /Thêm vào giỏ · 80\.000/ })); // 50 + 10 + 5 + 15
    expect(onConfirm).toHaveBeenCalledWith([SIZE.options[1], TOPPING.options[0], TOPPING.options[1]]);
  });

  it("blocks adding until a required group is chosen", async () => {
    const onConfirm = vi.fn();
    const noDefault = { ...PHO, modifier_groups: [{ ...SIZE, min_select: 1, max_select: 2 }] } as Product;
    render(<OptionsDialog product={noDefault} onClose={vi.fn()} onConfirm={onConfirm} />);

    await userEvent.click(screen.getByRole("button", { name: /Thêm vào giỏ/ }));

    expect(screen.getByRole("alert")).toHaveTextContent("Chọn Size");
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

describe("selection rules", () => {
  it("mirrors the server limits", () => {
    expect(defaultSelection([SIZE, TOPPING])).toEqual({ 1: [10], 2: [] });
    expect(selectionErrors([SIZE, TOPPING], { 1: [], 2: [20, 21, 22] })).toEqual({ 1: "Chọn Size", 2: "Chọn tối đa 2" });
  });
});
