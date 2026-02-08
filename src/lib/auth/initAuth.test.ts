// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

const ensureAuthPersistence = vi.fn().mockResolvedValue("indexeddb");
vi.mock("@/auth/webAuth", () => {
  return {
    ensureWebAuthPersistence: (...args: any[]) => ensureAuthPersistence(...args),
    finalizeRedirectResult: vi.fn().mockResolvedValue(null),
  };
});

const startAuthListener = vi.fn().mockResolvedValue(undefined);
vi.mock("@/auth/mbs-auth", () => {
  return { startAuthListener: (...args: any[]) => startAuthListener(...args) };
});

describe("initAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("does not throw on a clean boot", async () => {
    const { initAuth, getInitAuthState } = await import("./initAuth");
    await expect(initAuth()).resolves.toMatchObject({
      completed: true,
      persistence: "indexeddb",
      timedOut: false,
    });
    const state = getInitAuthState();
    expect(state.started).toBe(true);
    expect(state.completed).toBe(true);
    expect(state.persistence).toBe("indexeddb");
    expect(state.redirectError).toBeNull();
    expect(state.timedOut).toBe(false);
    expect(state.lastError).toBeNull();
    expect(state.step).toBe("done");
  });

  it("swallows redirect finalization errors (doesn't crash boot)", async () => {
    const { finalizeRedirectResult } = await import("@/auth/webAuth");
    (finalizeRedirectResult as any).mockRejectedValueOnce(
      new Error("redirect_failed")
    );
    const { initAuth, getInitAuthState } = await import("./initAuth");
    await expect(initAuth()).resolves.toMatchObject({ completed: true });
    const state = getInitAuthState();
    expect(state.completed).toBe(true);
    expect(state.redirectError).toContain("redirect_failed");
    expect(state.timedOut).toBe(false);
  });
});
