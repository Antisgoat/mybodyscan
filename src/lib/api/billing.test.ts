import { describe, it, expect } from "vitest";
import { buildCheckoutHeaders } from "./billing";

describe("buildCheckoutHeaders", () => {
  it("includes both Authorization and App Check when provided", () => {
    const h = buildCheckoutHeaders("id.token", "appcheck.token");
    expect(h.Authorization).toBe("Bearer id.token");
    expect(h["X-Firebase-AppCheck"]).toBe("appcheck.token");
    expect(h["Content-Type"]).toBe("application/json");
  });

  it("omits headers when tokens missing", () => {
    const h = buildCheckoutHeaders();
    expect(h.Authorization).toBeUndefined();
    expect(h["X-Firebase-AppCheck"]).toBeUndefined();
    expect(h["Content-Type"]).toBe("application/json");
  });
});
