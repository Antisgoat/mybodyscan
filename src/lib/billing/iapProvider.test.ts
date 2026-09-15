import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const revenueCatState = vi.hoisted(() => ({
  configured: false,
  appUserID: "",
  configure: vi.fn(),
  logIn: vi.fn(),
  setLogLevel: vi.fn(),
  getOfferings: vi.fn(),
}));

vi.mock("@/lib/platform", () => ({
  isNative: () => true,
}));

vi.mock("@revenuecat/purchases-capacitor", () => ({
  LOG_LEVEL: {
    DEBUG: "DEBUG",
  },
  Purchases: {
    setLogLevel: revenueCatState.setLogLevel,
    isConfigured: vi.fn(async () => ({
      isConfigured: revenueCatState.configured,
    })),
    configure: revenueCatState.configure,
    getAppUserID: vi.fn(async () => ({
      appUserID: revenueCatState.appUserID,
    })),
    logIn: revenueCatState.logIn,
    getOfferings: revenueCatState.getOfferings,
  },
}));

describe("RevenueCat initialization", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("VITE_RC_API_KEY_IOS", "appl_public_test_key");
    revenueCatState.configured = false;
    revenueCatState.appUserID = "";
    revenueCatState.configure.mockReset();
    revenueCatState.configure.mockImplementation(
      async ({ appUserID }: { appUserID: string }) => {
        revenueCatState.configured = true;
        revenueCatState.appUserID = appUserID;
      }
    );
    revenueCatState.logIn.mockReset();
    revenueCatState.logIn.mockImplementation(
      async ({ appUserID }: { appUserID: string }) => {
        revenueCatState.appUserID = appUserID;
        return { created: false, customerInfo: {} };
      }
    );
    revenueCatState.setLogLevel.mockReset();
    revenueCatState.setLogLevel.mockResolvedValue(undefined);
    revenueCatState.getOfferings.mockReset();
    revenueCatState.getOfferings.mockResolvedValue({ current: null, all: {} });
    Object.assign(globalThis, {
      Capacitor: {
        getPlatform: () => "ios",
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    delete (globalThis as typeof globalThis & { Capacitor?: unknown })
      .Capacitor;
  });

  it("serializes concurrent calls and configures the SDK only once", async () => {
    const { initPurchases } = await import("./iapProvider");

    const [first, second] = await Promise.all([
      initPurchases({ uid: "firebase-user-1" }),
      initPurchases({ uid: "firebase-user-1" }),
    ]);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(revenueCatState.configure).toHaveBeenCalledTimes(1);
    expect(revenueCatState.configure).toHaveBeenCalledWith({
      apiKey: "appl_public_test_key",
      appUserID: "firebase-user-1",
    });
    expect(revenueCatState.logIn).not.toHaveBeenCalled();
    expect(revenueCatState.setLogLevel).toHaveBeenCalledWith({
      level: "DEBUG",
    });
  });

  it("uses RevenueCat logIn when the Firebase account changes", async () => {
    const { initPurchases } = await import("./iapProvider");

    await initPurchases({ uid: "firebase-user-1" });
    const result = await initPurchases({ uid: "firebase-user-2" });

    expect(result.ok).toBe(true);
    expect(revenueCatState.configure).toHaveBeenCalledTimes(1);
    expect(revenueCatState.logIn).toHaveBeenCalledTimes(1);
    expect(revenueCatState.logIn).toHaveBeenCalledWith({
      appUserID: "firebase-user-2",
    });
  });

  it("returns a recoverable error instead of loading offerings forever", async () => {
    vi.useFakeTimers();
    revenueCatState.getOfferings.mockImplementation(
      () => new Promise(() => undefined)
    );
    const { getOfferings } = await import("./iapProvider");

    const pending = getOfferings();
    await vi.advanceTimersByTimeAsync(10_000);

    await expect(pending).resolves.toMatchObject({
      ok: false,
      code: "offerings_failed",
    });
  });
});
