import { hasPro } from "@/lib/entitlements/pro";

export type SubscriptionGate = {
  status?: string | null;
};

export type ClaimsGate = {
  unlimited?: boolean;
  unlimitedCredits?: boolean;
  creditsUnlimited?: boolean;
  admin?: boolean;
  staff?: boolean;
  dev?: boolean;
  role?: string;
  [k: string]: unknown;
};

export type { Entitlements } from "@/lib/entitlements/pro";
export { hasPro } from "@/lib/entitlements/pro";

/**
 * @deprecated Prefer the unified `Entitlements` doc + `hasPro()` gate.
 * Kept for backwards compatibility in older call sites/tests.
 */
export function hasUnlimitedEntitlement(claims: ClaimsGate | null | undefined): boolean {
  if (!claims) return false;
  return (
    claims.unlimited === true ||
    claims.unlimitedCredits === true ||
    claims.creditsUnlimited === true ||
    claims.admin === true ||
    claims.staff === true ||
    (typeof claims.role === "string" && claims.role.toLowerCase() === "admin")
  );
}

/**
 * @deprecated Prefer the unified `Entitlements` doc + `hasPro()` gate.
 * Kept for backwards compatibility in older call sites/tests.
 */
export function hasActiveSubscription(sub: SubscriptionGate | null | undefined): boolean {
  const status = (sub?.status || "").toLowerCase();
  // Stripe-ish statuses we treat as entitled.
  return (
    status === "active" ||
    status === "trialing" ||
    // Some backfills / legacy writes store these for paid users.
    status === "paid" ||
    status === "unlimited" ||
    status === "lifetime"
  );
}

export function canUseCoach(params: {
  demo?: boolean;
  entitlements?: import("@/lib/entitlements/pro").Entitlements | null;
}): boolean {
  if (params.demo) return false;
  return hasPro(params.entitlements);
}

export function canStartPrograms(params: {
  demo?: boolean;
  entitlements?: import("@/lib/entitlements/pro").Entitlements | null;
}): boolean {
  if (params.demo) return false;
  return hasPro(params.entitlements);
}

