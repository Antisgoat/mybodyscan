export function hasUnlimitedAccessFromClaims(claims: any): boolean {
  if (!claims) return false;
  const role = typeof claims?.role === "string" ? claims.role.toLowerCase() : "";
  return (
    claims?.unlimitedCredits === true ||
    claims?.unlimited === true ||
    claims?.creditsUnlimited === true ||
    claims?.admin === true ||
    claims?.staff === true ||
    role === "admin"
  );
}

export function hasActiveSubscriptionFromUserDoc(userDoc: any): boolean {
  const status = String(userDoc?.subscription?.status || "").toLowerCase();
  return (
    status === "active" ||
    status === "trialing" ||
    // Some backfills / legacy writes store these for paid users.
    status === "paid" ||
    status === "unlimited" ||
    status === "lifetime"
  );
}

