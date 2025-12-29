// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/firebase", () => {
  return {
    getFirebaseAuth: () => ({}),
    getFirebaseConfig: () => ({ authDomain: "example.firebaseapp.com", projectId: "example" }),
  };
});

vi.mock("@/lib/telemetry", () => {
  return { reportError: vi.fn().mockResolvedValue(undefined) };
});

vi.mock("@/lib/auth", () => {
  return { rememberAuthRedirect: vi.fn() };
});

vi.mock("@/lib/authRedirect", () => {
  return { handleAuthRedirectOnce: vi.fn() };
});

function setUserAgent(ua: string) {
  Object.defineProperty(window.navigator, "userAgent", {
    value: ua,
    configurable: true,
  });
}

describe("isIosSafari", () => {
  it("detects iPhone Safari", () => {
    setUserAgent(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1"
    );
    return import("./oauth").then(({ isIosSafari }) => {
      expect(isIosSafari()).toBe(true);
    });
  });

  it("does not treat iOS Chrome as Safari", () => {
    setUserAgent(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.0.0 Mobile/15E148 Safari/604.1"
    );
    return import("./oauth").then(({ isIosSafari }) => {
      expect(isIosSafari()).toBe(false);
    });
  });
});

describe("signInWithOAuthProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    sessionStorage.clear();
  });

  it("stores pending state and times out within 15s (no silent hang)", async () => {
    vi.useFakeTimers();
    // Ensure the code path uses popupThenRedirect (desktop-ish), not redirect.
    setUserAgent(
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );
    try {
      delete (window as any).Capacitor;
      delete (window as any).flutter_inappwebview;
    } catch {
      // ignore
    }
    const { signInWithOAuthProvider, peekPendingOAuth, __oauthTestInternals } =
      await import("./oauth");
    __oauthTestInternals.reset();
    __oauthTestInternals.setPopupThenRedirectForTest(
      () => new Promise(() => undefined) as any
    );

    const promise = signInWithOAuthProvider({
      providerId: "google.com",
      provider: {} as any,
      next: "/home",
    });

    expect(peekPendingOAuth()?.providerId).toBe("google.com");

    const rejection = expect(promise).rejects.toMatchObject({ code: "auth/timeout" });
    await vi.advanceTimersByTimeAsync(15_000);
    await rejection;

    expect(peekPendingOAuth()).toBeNull();
    vi.useRealTimers();
  });
});

describe("finalizeRedirectResult", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    sessionStorage.clear();
  });

  it("returns null when no redirect result", async () => {
    const { handleAuthRedirectOnce } = await import("@/lib/authRedirect");
    (handleAuthRedirectOnce as any).mockResolvedValue({
      result: null,
      error: null,
      normalizedError: null,
    });
    const { finalizeRedirectResult, __oauthTestInternals } = await import("./oauth");
    __oauthTestInternals.reset();
    const out = await finalizeRedirectResult();
    expect(out).toBeNull();
  });

  it("returns user+credential when redirect result exists", async () => {
    const cred = { user: { uid: "u1" } } as any;
    const { handleAuthRedirectOnce } = await import("@/lib/authRedirect");
    (handleAuthRedirectOnce as any).mockResolvedValue({
      result: cred,
      error: null,
      normalizedError: null,
    });
    const { finalizeRedirectResult, __oauthTestInternals } = await import("./oauth");
    __oauthTestInternals.reset();
    const out = await finalizeRedirectResult();
    expect(out?.user?.uid).toBe("u1");
    expect(out?.credential).toBe(cred);
  });
});

