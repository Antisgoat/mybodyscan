export type BillingEntitlementSource = "stripe" | "iap";

export type BillingEntitlementState = {
  pro: boolean;
  expiresAt: number | null;
};

export type BillingEntitlementProjection = {
  pro: boolean;
  source: BillingEntitlementSource;
  expiresAt: number | null;
};

type EntitlementDocument = Record<string, unknown>;

function asRecord(value: unknown): EntitlementDocument {
  return value && typeof value === "object"
    ? (value as EntitlementDocument)
    : {};
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isActive(state: BillingEntitlementState, nowMs: number): boolean {
  if (!state.pro) return false;
  return state.expiresAt == null || state.expiresAt > nowMs;
}

function readStoredState(
  currentValue: unknown,
  source: BillingEntitlementSource,
  nowMs: number
): BillingEntitlementState {
  const current = asRecord(currentValue);
  const key = source === "stripe" ? "stripe" : "revenueCat";
  const nested = asRecord(current[key]);
  if (typeof nested.pro === "boolean") {
    const state = {
      pro: nested.pro,
      expiresAt: readNumber(nested.expiresAt),
    };
    return { ...state, pro: isActive(state, nowMs) };
  }

  // Backward compatibility for entitlement documents written before each
  // billing source stored its own state.
  if (current.source === source && current.pro === true) {
    const state = {
      pro: true,
      expiresAt: readNumber(current.expiresAt),
    };
    return { ...state, pro: isActive(state, nowMs) };
  }
  return { pro: false, expiresAt: null };
}

export function projectBillingEntitlement(params: {
  current: unknown;
  incomingSource: BillingEntitlementSource;
  incoming: BillingEntitlementState;
  nowMs?: number;
}): BillingEntitlementProjection {
  const nowMs = params.nowMs ?? Date.now();
  const stripe =
    params.incomingSource === "stripe"
      ? params.incoming
      : readStoredState(params.current, "stripe", nowMs);
  const iap =
    params.incomingSource === "iap"
      ? params.incoming
      : readStoredState(params.current, "iap", nowMs);
  const stripeActive = isActive(stripe, nowMs);
  const iapActive = isActive(iap, nowMs);

  if (params.incomingSource === "iap" && iapActive) {
    return { pro: true, source: "iap", expiresAt: iap.expiresAt };
  }
  if (params.incomingSource === "stripe" && stripeActive) {
    return { pro: true, source: "stripe", expiresAt: stripe.expiresAt };
  }
  if (iapActive) {
    return { pro: true, source: "iap", expiresAt: iap.expiresAt };
  }
  if (stripeActive) {
    return { pro: true, source: "stripe", expiresAt: stripe.expiresAt };
  }
  return {
    pro: false,
    source: params.incomingSource,
    expiresAt: params.incoming.expiresAt,
  };
}
