import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeMenu } from "./ThemeMenu";
import { THEME_STORAGE_KEY, ThemeProvider, useTheme } from "./ThemeProvider";

// jsdom không có matchMedia: giả lập cài đặt sáng/tối của hệ điều hành, đổi được trong test
let systemDark = false;
const listeners = new Set<() => void>();
function setSystemDark(dark: boolean) {
  systemDark = dark;
  listeners.forEach((listener) => listener());
}

beforeEach(() => {
  systemDark = false;
  listeners.clear();
  localStorage.clear();
  document.documentElement.classList.remove("dark");
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      get matches() {
        return systemDark;
      },
      addEventListener: (_: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
    })),
  );
});

afterEach(() => vi.unstubAllGlobals());

function Resolved() {
  return <span data-testid="resolved">{useTheme().resolved}</span>;
}

function renderWithMenu() {
  render(
    <ThemeProvider>
      <ThemeMenu />
      <Resolved />
    </ThemeProvider>,
  );
}

const isDark = () => document.documentElement.classList.contains("dark");

describe("ThemeProvider", () => {
  it("follows the operating system by default, including later changes", async () => {
    renderWithMenu();
    expect(isDark()).toBe(false);

    setSystemDark(true);
    await vi.waitFor(() => expect(isDark()).toBe(true));
    expect(screen.getByTestId("resolved")).toHaveTextContent("dark");
  });

  it("remembers an explicit choice and ignores the system setting", async () => {
    renderWithMenu();

    await userEvent.click(screen.getByRole("button", { name: "Giao diện sáng/tối" }));
    await userEvent.click(await screen.findByRole("menuitemradio", { name: "Tối" }));

    expect(isDark()).toBe(true);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    setSystemDark(false);
    expect(isDark()).toBe(true);
  });

  it("starts from the stored choice and clears it when going back to system", async () => {
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    renderWithMenu();
    expect(isDark()).toBe(true);

    await userEvent.click(screen.getByRole("button", { name: "Giao diện sáng/tối" }));
    await userEvent.click(await screen.findByRole("menuitemradio", { name: "Theo hệ thống" }));

    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    expect(isDark()).toBe(false);
  });
});
