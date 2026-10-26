import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { MoneyInput } from "./MoneyInput";

function Harness() {
  const [value, setValue] = useState("");
  return (
    <>
      <MoneyInput aria-label="Giá" value={value} onChange={setValue} />
      <output data-testid="raw">{value}</output>
    </>
  );
}

describe("MoneyInput", () => {
  it("shows Vietnamese grouping while storing plain digits", async () => {
    render(<Harness />);

    await userEvent.type(screen.getByLabelText("Giá"), "1250000");

    expect(screen.getByLabelText("Giá")).toHaveValue("1.250.000");
    expect(screen.getByTestId("raw")).toHaveTextContent(/^1250000$/);
  });

  it("ignores letters, signs and leading zeros", async () => {
    render(<Harness />);

    await userEvent.type(screen.getByLabelText("Giá"), "00-3a2.000");

    expect(screen.getByTestId("raw")).toHaveTextContent(/^32000$/);
  });
});
