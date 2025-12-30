import { isNative } from "@/lib/platform";

export type IapInitParams = { uid: string };

export type IapProviderResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: string; message: string; cause?: unknown };

type Platform = "ios" | "android" | "web";

function detectPlatform(): Platform {
  try {
    const anyWin = globalThis as any;
    const cap = anyWin?.Capacitor;
    if (cap?.getPlatform) {
      const p = String(cap.getPlatform?.() || "").toLowerCase();
      if (p === "ios" || p === "android") return p;
    }
  } catch {
    // ignore
  }
  return "web";
}

function getApiKey(): string {
  const platform = detectPlatform();
  const iosKey = (import.meta.env.VITE_RC_API_KEY_IOS ?? "").trim();
  const androidKey = (import.meta.env.VITE_RC_API_KEY_ANDROID ?? "").trim();
  if (platform === "ios") return iosKey;
  if (platform === "android") return androidKey;
  return "";
}

export function getEntitlementId(): string {
  return (import.meta.env.VITE_RC_ENTITLEMENT_ID ?? "pro").trim() || "pro";
}

async function getPurchases() {
  const mod = await import("@revenuecat/purchases-capacitor");
  return mod.Purchases;
}

export async function initPurchases(
  params: IapInitParams
): Promise<IapProviderResult<void>> {
  if (!isNative()) {
    return { ok: false, code: "not_native", message: "IAP is only available on native builds." };
  }
  const apiKey = getApiKey();
  if (!apiKey) {
    return {
      ok: false,
      code: "missing_api_key",
      message: "RevenueCat API key missing for this platform.",
    };
  }
  const uid = String(params.uid || "").trim();
  if (!uid) {
    return { ok: false, code: "missing_uid", message: "Missing Firebase uid." };
  }
  try {
    const Purchases = await getPurchases();
    if (import.meta.env.DEV) {
      try {
        await Purchases.setLogLevel({ level: 2 }); // LOG_LEVEL.DEBUG (number enum in internal types)
      } catch {
        // ignore
      }
    }
    await Purchases.configure({ apiKey, appUserID: uid });
    return { ok: true, value: undefined };
  } catch (cause) {
    return {
      ok: false,
      code: "configure_failed",
      message: "Failed to initialize in-app purchases.",
      cause,
    };
  }
}

export type Offerings = import("@revenuecat/purchases-capacitor").PurchasesOfferings;
export type Offering = import("@revenuecat/purchases-capacitor").PurchasesOffering;
export type IapPackage = import("@revenuecat/purchases-capacitor").PurchasesPackage;
export type CustomerInfo = import("@revenuecat/purchases-capacitor").CustomerInfo;

export async function getOfferings(): Promise<IapProviderResult<Offerings>> {
  if (!isNative()) {
    return { ok: false, code: "not_native", message: "IAP is only available on native builds." };
  }
  try {
    const Purchases = await getPurchases();
    const offerings = await Purchases.getOfferings();
    return { ok: true, value: offerings };
  } catch (cause) {
    return { ok: false, code: "offerings_failed", message: "Unable to load offerings.", cause };
  }
}

export async function purchasePackage(
  aPackage: IapPackage
): Promise<IapProviderResult<CustomerInfo>> {
  if (!isNative()) {
    return { ok: false, code: "not_native", message: "IAP is only available on native builds." };
  }
  try {
    const Purchases = await getPurchases();
    const result = await Purchases.purchasePackage({ aPackage });
    return { ok: true, value: result.customerInfo };
  } catch (cause: any) {
    const cancelled = Boolean(cause?.userCancelled) || Boolean(cause?.userCanceled);
    if (cancelled) {
      return { ok: false, code: "cancelled", message: "Purchase cancelled.", cause };
    }
    return { ok: false, code: "purchase_failed", message: "Purchase failed.", cause };
  }
}

export async function restorePurchases(): Promise<IapProviderResult<CustomerInfo>> {
  if (!isNative()) {
    return { ok: false, code: "not_native", message: "IAP is only available on native builds." };
  }
  try {
    const Purchases = await getPurchases();
    const result = await Purchases.restorePurchases();
    return { ok: true, value: result.customerInfo };
  } catch (cause) {
    return { ok: false, code: "restore_failed", message: "Restore failed.", cause };
  }
}

