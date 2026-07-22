import { createHash } from "node:crypto";

export type RevenueCatPlan = {
  plan: "monthly" | "yearly" | "one";
  credits: number;
  subscription: boolean;
};

type RevenueCatEvent = Record<string, unknown>;

function asEvent(value: unknown): RevenueCatEvent {
  return value && typeof value === "object"
    ? (value as RevenueCatEvent)
    : {};
}

export const REVENUECAT_PRODUCT_IDS = {
  monthly:
    process.env.REVENUECAT_MONTHLY_PRODUCT_ID?.trim() ||
    "com.mybodyscan.pro.monthly",
  yearly:
    process.env.REVENUECAT_YEARLY_PRODUCT_ID?.trim() ||
    "com.mybodyscan.pro.yearly",
  one:
    process.env.REVENUECAT_ONE_SCAN_PRODUCT_ID?.trim() ||
    "com.mybodyscan.scan.single",
} as const;

export function resolveRevenueCatPlan(productId: string): RevenueCatPlan | null {
  const normalized = String(productId || "").trim();
  if (normalized === REVENUECAT_PRODUCT_IDS.monthly) {
    return { plan: "monthly", credits: 3, subscription: true };
  }
  if (normalized === REVENUECAT_PRODUCT_IDS.yearly) {
    return { plan: "yearly", credits: 36, subscription: true };
  }
  if (normalized === REVENUECAT_PRODUCT_IDS.one) {
    return { plan: "one", credits: 1, subscription: false };
  }
  return null;
}

export function revenueCatCreditLedgerId(
  transactionId: string
): string | null {
  const normalized = String(transactionId || "").trim();
  if (!normalized) return null;
  const digest = createHash("sha256").update(normalized).digest("hex");
  return `revenuecat:${digest}`;
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function readEntitlementIds(eventValue: unknown): string[] {
  const event = asEvent(eventValue);
  const idsRaw = event.entitlement_ids ?? event.entitlementIds ?? null;
  const idRaw = event.entitlement_id ?? event.entitlementId ?? null;
  if (Array.isArray(idsRaw)) {
    return idsRaw.map(readString).filter(Boolean);
  }
  const id = readString(idRaw);
  return id ? [id] : [];
}

export function readRevenueCatProductId(eventValue: unknown): string {
  const event = asEvent(eventValue);
  return (
    readString(event.product_id) ||
    readString(event.productId) ||
    readString(event.product_identifier)
  );
}

export type RevenueCatEventDecision = {
  recognized: boolean;
  reason: string;
  productId: string;
  plan: RevenueCatPlan | null;
  pro: boolean | null;
  credits: number;
};

export function resolveRevenueCatEvent(params: {
  event: unknown;
  entitlementId: string;
  nowMs?: number;
}): RevenueCatEventDecision {
  const event = asEvent(params.event);
  const eventType = readString(event.type).toUpperCase();
  const productId = readRevenueCatProductId(event);
  const plan = resolveRevenueCatPlan(productId);
  if (!plan) {
    return {
      recognized: false,
      reason: eventType === "TEST" ? "test_event" : "unknown_product",
      productId,
      plan: null,
      pro: null,
      credits: 0,
    };
  }

  if (!plan.subscription) {
    return {
      recognized: true,
      reason:
        eventType === "NON_RENEWING_PURCHASE"
          ? "consumable_purchase"
          : "consumable_non_purchase_event",
      productId,
      plan,
      pro: null,
      credits: eventType === "NON_RENEWING_PURCHASE" ? plan.credits : 0,
    };
  }

  const entitlementIds = readEntitlementIds(event);
  if (
    entitlementIds.length > 0 &&
    !entitlementIds.includes(params.entitlementId)
  ) {
    return {
      recognized: false,
      reason: "wrong_entitlement",
      productId,
      plan,
      pro: null,
      credits: 0,
    };
  }

  const expiresAtMs =
    readNumber(event.expiration_at_ms) ??
    readNumber(event.expires_at_ms) ??
    readNumber(event.expirationAtMs) ??
    readNumber(event.expiresAtMs);
  const nowMs = params.nowMs ?? Date.now();
  let pro: boolean | null = null;
  if (
    eventType === "INITIAL_PURCHASE" ||
    eventType === "RENEWAL" ||
    eventType === "UNCANCELLATION"
  ) {
    pro = true;
  } else if (
    eventType === "EXPIRATION" ||
    eventType === "SUBSCRIPTION_PAUSED"
  ) {
    pro = false;
  } else if (
    eventType === "CANCELLATION" ||
    eventType === "BILLING_ISSUE" ||
    eventType === "PRODUCT_CHANGE"
  ) {
    pro = expiresAtMs != null && expiresAtMs > nowMs;
  } else if (expiresAtMs != null) {
    pro = expiresAtMs > nowMs;
  }

  const credits =
    eventType === "INITIAL_PURCHASE" || eventType === "RENEWAL"
      ? plan.credits
      : 0;
  return {
    recognized: true,
    reason: pro == null ? "recognized_no_state_change" : "subscription_event",
    productId,
    plan,
    pro,
    credits,
  };
}
