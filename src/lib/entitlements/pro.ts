export type Entitlements = {
  pro: boolean;
  source?: "iap" | "stripe" | "admin" | "admin_allowlist";
  /**
   * Milliseconds since epoch (UTC). If null/undefined, treat as non-expiring.
   */
  expiresAt?: number | null;
};

import { auth } from "@/lib/firebase";
import { isStaffProUser } from "@/lib/entitlements/staffPro";

export function hasPro(ent: Entitlements | null | undefined): boolean {
  // UX-only allowlist; server is authoritative.
  try {
    const user = auth?.currentUser ?? null;
    if (isStaffProUser({ uid: user?.uid ?? null, email: (user as any)?.email ?? null })) {
      return true;
    }
  } catch {
    // ignore
  }

  if (!ent?.pro) return false;
  const expiresAt = ent.expiresAt;
  if (expiresAt == null) return true;
  if (typeof expiresAt !== "number" || !Number.isFinite(expiresAt)) return false;
  return expiresAt > Date.now();
}

