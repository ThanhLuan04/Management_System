import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { MoneyInput } from "./MoneyInput";

function Harness() {
  const [value, setValue] = useState("");
  return (
    <>
      <MoneyInput aria-label="Giá" value={value} onChange={setValue} />
      <button type="button">Ra ngoài</button>
      <output data-testid="raw">{value}</output>
    </>
  );
}

describe("MoneyInput", () => {
  it("keeps exactly the typed digits while editing and groups them after leaving the field", async () => {
    render(<Harness />);
    const input = screen.getByLabelText("Giá");

    await userEvent.type(input, "1250000");
    // Đang gõ: không chèn dấu chấm (chữ trong ô không bị sửa giữa chừng → bộ gõ tiếng Việt không bị lệch)
    expect(input).toHaveValue("1250000");
    expect(screen.getByTestId("raw")).toHaveTextContent(/^1250000$/);

    await userEvent.click(screen.getByRole("button", { name: "Ra ngoài" }));
    expect(input).toHaveValue("1.250.000");
  });

  it("ignores letters, signs and leading zeros", async () => {
    render(<Harness />);

    await userEvent.type(screen.getByLabelText("Giá"), "00-3a2.000");

    expect(screen.getByTestId("raw")).toHaveTextContent(/^32000$/);
  });

  it("waits for an IME composition (Vietnamese Telex) to finish before taking the value", () => {
    render(<Harness />);
    const input = screen.getByLabelText("Giá");
    fireEvent.focus(input);

    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: "15" } });
    // Đang ghép: hiện nguyên chữ bộ gõ đưa vào, chưa đổi giá trị
    expect(input).toHaveValue("15");
    expect(screen.getByTestId("raw")).toHaveTextContent(/^$/);

    fireEvent.change(input, { target: { value: "15000" } });
    fireEvent.compositionEnd(input, { target: { value: "15000" } });

    expect(screen.getByTestId("raw")).toHaveTextContent(/^15000$/);
    expect(input).toHaveValue("15000");
  });

  it("shows grouped digits when the value comes from outside (not editing)", () => {
    render(<MoneyInput aria-label="Tiền" value="132000" onChange={() => {}} />);
    expect(screen.getByLabelText("Tiền")).toHaveValue("132.000");
  });
});
