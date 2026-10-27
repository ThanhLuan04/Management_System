import { AxiosError, AxiosHeaders } from "axios";
import { describe, expect, it } from "vitest";

import { toApiError } from "./apiError";

function axiosError(status: number, data: unknown, headers: Record<string, string> = {}) {
  const config = { headers: new AxiosHeaders() };
  return new AxiosError("fail", "ERR", config, null, {
    status,
    statusText: "",
    data,
    headers,
    config,
  });
}

describe("toApiError", () => {
  it("keeps the backend error code and message", () => {
    const err = toApiError(
      axiosError(401, { error: { code: "INVALID_CREDENTIALS", message: "Sai mật khẩu" } }, { "x-request-id": "abc" }),
    );
    expect(err.code).toBe("INVALID_CREDENTIALS");
    expect(err.message).toBe("Sai mật khẩu");
  });

  it("reports a connection problem when the proxy answers instead of the backend", () => {
    const err = toApiError(axiosError(500, ""));
    expect(err.code).toBe("NETWORK_ERROR");
    expect(err.message).toMatch(/Không kết nối được máy chủ/);
  });

  it("reports an unknown server error for a backend response without the error envelope", () => {
    const err = toApiError(axiosError(500, "oops", { "x-request-id": "abc" }));
    expect(err.code).toBe("HTTP_ERROR");
  });
});
