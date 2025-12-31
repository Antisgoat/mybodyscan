import { FieldValue, getFirestore } from "../firebase.js";
import { isUnlimitedUser } from "./unlimitedUsers.js";
import { STAFF_PRO_EMAIL_ALLOWLIST, STAFF_PRO_UID_ALLOWLIST } from "./staffPro.js";

export type AdminProParams = {
  uid?: string | null;
  email?: string | null;
};

function normalizeEmail(email?: string | null): string | null {
  if (typeof email !== "string") return null;
  const v = email.trim().toLowerCase();
  return v ? v : null;
}

function normalizeUid(uid?: string | null): string | null {
  if (typeof uid !== "string") return null;
  const v = uid.trim();
  return v ? v : null;
}

/**
 * Admin-granted Pro allowlist.
 *
 * Notes:
 * - Email matching is case-insensitive.
 * - UID allowlist exists for Apple/Google accounts without stable emails.
 * - IMPORTANT: Unlimited allowlist users MUST be treated as Pro too. We enforce that
 *   by treating `isUnlimitedUser(...)` as an automatic Pro grant.
 *
 * Canonical STAFF/TEST allowlist is shared via `staffPro.ts` to keep server gates consistent.
 */
export const ADMIN_PRO_UIDS = STAFF_PRO_UID_ALLOWLIST;
export const ADMIN_PRO_EMAILS = STAFF_PRO_EMAIL_ALLOWLIST;

export function isAdminPro(params: AdminProParams): boolean {
  // Non-negotiable: unlimited allowlist implies Pro.
  if (isUnlimitedUser({ uid: params.uid, email: params.email })) return true;

  const uid = normalizeUid(params.uid);
  if (uid && ADMIN_PRO_UIDS.has(uid)) return true;

  const email = normalizeEmail(params.email);
  if (email && ADMIN_PRO_EMAILS.has(email)) return true;

  return false;
}

export type EnsureAdminProEntitlementResult = {
  didWrite: boolean;
  entitlements: Record<string, unknown> | null;
};

export type EnsureAdminProEntitlementDeps = {
  /**
   * Injectable for unit tests.
   * When omitted, uses the default Admin SDK Firestore instance.
   */
  db?: FirebaseFirestore.Firestore;
};

/**
 * Single source of truth for Pro: `users/{uid}/entitlements/current`.
 *
 * Idempotent:
 * - If pro is already true, does nothing.
 * - Never removes existing fields written by RevenueCat/Stripe.
 * - Never overwrites a paid `source` ("iap"/"stripe"); admin grant is additive.
 */
export async function ensureAdminProEntitlement(
  uidRaw: string,
  emailRaw?: string | null,
  deps: EnsureAdminProEntitlementDeps = {}
): Promise<EnsureAdminProEntitlementResult> {
  const uid = normalizeUid(uidRaw);
  const email = normalizeEmail(emailRaw);
  if (!uid) return { didWrite: false, entitlements: null };
  if (!isAdminPro({ uid, email })) return { didWrite: false, entitlements: null };

  const db = deps.db ?? getFirestore();
  const ref = db.doc(`users/${uid}/entitlements/current`);

  const didWrite = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const existing = snap.exists ? ((snap.data() as any) ?? {}) : {};

    const existingSource =
      typeof existing?.source === "string" ? String(existing.source) : "";
    const existingExpiresAt = existing?.expiresAt ?? undefined;
    const existingGrantedAt = existing?.grantedAt ?? undefined;

    // For allowlisted/unlimited/staff users, we want a durable admin Pro grant:
    // - `pro: true`
    // - `source: "admin"` so Stripe/RevenueCat cannot overwrite/revoke it
    // - `expiresAt: null` (non-expiring)
    // - `grantedAt` set once (server timestamp)
    //
    // We intentionally update even if `pro === true` already, so that a paid
    // entitlement (source "stripe"/"iap") can't later revoke access for
    // allowlisted users.
    const alreadyCorrect =
      existing?.pro === true &&
      (existingSource === "admin" || existingSource === "admin_allowlist") &&
      existingExpiresAt === null;

    if (alreadyCorrect) {
      return false;
    }

    const payload: Record<string, unknown> = {
      pro: true,
      source: "admin",
      expiresAt: null,
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (existingGrantedAt == null) {
      payload.grantedAt = FieldValue.serverTimestamp();
    }

    tx.set(ref, payload, { merge: true });
    return true;
  });

  const after = await ref.get().catch(() => null);
  const entitlements = after?.exists ? (((after.data() as any) ?? {}) as any) : null;
  return { didWrite, entitlements };
}

