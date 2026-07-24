import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const revenueCatState = vi.hoisted(() => ({
  configured: false,
  appUserID: "",
  configure: vi.fn(),
  logIn: vi.fn(),
}));

vi.mock("@/lib/platform", () => ({
  isNative: () => true,
}));

vi.mock("@revenuecat/purchases-capacitor", () => ({
  Purchases: {
    setLogLevel: vi.fn(async () => undefined),
    isConfigured: vi.fn(async () => ({
      isConfigured: revenueCatState.configured,
    })),
    configure: revenueCatState.configure,
    getAppUserID: vi.fn(async () => ({
      appUserID: revenueCatState.appUserID,
    })),
    logIn: revenueCatState.logIn,
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
    Object.assign(globalThis, {
      Capacitor: {
        getPlatform: () => "ios",
      },
    });
  });

  afterEach(() => {
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
});
