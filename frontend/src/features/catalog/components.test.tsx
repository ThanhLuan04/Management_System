import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { initials, ProductThumb, tileHue } from "./components";

describe("initials", () => {
  it("takes the first letter of the first two words that contain letters", () => {
    expect(initials("Bia Heineken lon 330ml")).toBe("BH");
    expect(initials("nước mắm Nam Ngư")).toBe("NM");
    expect(initials("7Up lon 330ml")).toBe("UL");
    expect(initials("Đường")).toBe("Đ");
  });

  it("returns empty text when the name has no letters", () => {
    expect(initials("123 456")).toBe("");
  });
});

describe("tileHue", () => {
  it("always gives the same colour for the same name", () => {
    expect(tileHue("Coca-Cola lon 330ml")).toBe(tileHue("Coca-Cola lon 330ml"));
  });
});

describe("ProductThumb", () => {
  it("shows the photo when there is one", () => {
    render(<ProductThumb url="/uploads/products/a.webp" name="Pepsi" />);
    expect(screen.getByRole("img", { name: "Pepsi" })).toHaveAttribute("src", "/uploads/products/a.webp");
  });

  it("shows initials with an accessible name when there is no photo", () => {
    render(<ProductThumb url={null} name="Sữa tươi TH" />);
    expect(screen.getByRole("img", { name: "Sữa tươi TH (chưa có ảnh)" })).toHaveTextContent("ST");
  });
});
