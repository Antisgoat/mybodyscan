import { describe, expect, it } from "vitest";

describe("web import safety", () => {
  it("does not crash when VITE_RC_* env vars are missing", async () => {
    // In CI/web builds, RevenueCat env vars may be undefined. Imports should never throw.
    await import("@/lib/billing/iapProvider");
    await import("@/App");
    expect(true).toBe(true);
  });
});

