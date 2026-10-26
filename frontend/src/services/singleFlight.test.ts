import { describe, expect, it, vi } from "vitest";

import { singleFlight } from "./singleFlight";

describe("singleFlight", () => {
  it("runs the task once for concurrent callers and shares the result", async () => {
    let resolve!: (value: string) => void;
    const task = vi.fn(() => new Promise<string>((r) => (resolve = r)));
    const refresh = singleFlight(task);

    const calls = [refresh(), refresh(), refresh()];
    resolve("token-1");

    await expect(Promise.all(calls)).resolves.toEqual(["token-1", "token-1", "token-1"]);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it("runs again after the previous call settled", async () => {
    const task = vi.fn().mockResolvedValueOnce("a").mockResolvedValueOnce("b");
    const refresh = singleFlight(task);

    expect(await refresh()).toBe("a");
    expect(await refresh()).toBe("b");
    expect(task).toHaveBeenCalledTimes(2);
  });

  it("shares failures too and allows a retry afterwards", async () => {
    const task = vi.fn().mockRejectedValueOnce(new Error("expired")).mockResolvedValueOnce("ok");
    const refresh = singleFlight(task);

    await expect(Promise.all([refresh(), refresh()])).rejects.toThrow("expired");
    expect(task).toHaveBeenCalledTimes(1);
    expect(await refresh()).toBe("ok");
  });
});
