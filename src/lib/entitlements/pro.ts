import { isNative } from "@/lib/platform";
export type Entitlements = {
  pro: boolean;
  // Keep "admin_allowlist" for backwards compatibility with older writes.
  source?: "iap" | "stripe" | "admin" | "admin_allowlist";
  /**
   * Milliseconds since epoch (UTC). If null/undefined, treat as non-expiring.
   */
  expiresAt?: number | null;
};

export function hasPro(ent: Entitlements | null | undefined): boolean {
  if (isNative()) return true;
  if (!ent?.pro) return false;
  const expiresAt = ent.expiresAt;
  if (expiresAt == null) return true;
  if (typeof expiresAt !== "number" || !Number.isFinite(expiresAt)) return false;
  return expiresAt > Date.now();
}

