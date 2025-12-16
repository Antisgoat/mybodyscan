export type SubscriptionGate = {
  status?: string | null;
};

export type ClaimsGate = {
  unlimited?: boolean;
  unlimitedCredits?: boolean;
  admin?: boolean;
  staff?: boolean;
  dev?: boolean;
  [k: string]: unknown;
};

export function hasUnlimitedEntitlement(claims: ClaimsGate | null | undefined): boolean {
  if (!claims) return false;
  return (
    claims.unlimited === true ||
    claims.unlimitedCredits === true ||
    claims.admin === true ||
    claims.staff === true
  );
}

export function hasActiveSubscription(sub: SubscriptionGate | null | undefined): boolean {
  const status = (sub?.status || "").toLowerCase();
  // Stripe-ish statuses we treat as entitled.
  return status === "active" || status === "trialing";
}

export function canUseCoach(params: {
  demo?: boolean;
  claims?: ClaimsGate | null;
  subscription?: SubscriptionGate | null;
}): boolean {
  if (params.demo) return false;
  if (hasUnlimitedEntitlement(params.claims)) return true;
  if (hasActiveSubscription(params.subscription)) return true;
  // Coach is currently a paid/unlimited feature.
  return false;
}

export function canStartPrograms(params: {
  demo?: boolean;
  claims?: ClaimsGate | null;
  subscription?: SubscriptionGate | null;
}): boolean {
  if (params.demo) return false;
  if (hasUnlimitedEntitlement(params.claims)) return true;
  if (hasActiveSubscription(params.subscription)) return true;
  return false;
}

