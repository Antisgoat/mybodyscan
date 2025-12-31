import { FieldValue, getFirestore } from "../firebase.js";

function normalizeUid(uid?: string | null): string | null {
  if (typeof uid !== "string") return null;
  const v = uid.trim();
  return v ? v : null;
}

export type EnsureAdminGrantedProEntitlementDeps = {
  db?: FirebaseFirestore.Firestore;
};

/**
 * Used when an admin explicitly grants unlimited credits (or similar).
 *
 * Guarantees `users/{uid}/entitlements/current.pro === true` without breaking paid entitlements:
 * - MERGE only
 * - If `source` is already "iap" or "stripe", preserves it
 * - If `grantedAt` already exists, preserves it
 */
export async function ensureAdminGrantedProEntitlement(
  uidRaw: string,
  deps: EnsureAdminGrantedProEntitlementDeps = {}
): Promise<{ didWrite: boolean }> {
  const uid = normalizeUid(uidRaw);
  if (!uid) return { didWrite: false };

  const db = deps.db ?? getFirestore();
  const ref = db.doc(`users/${uid}/entitlements/current`);

  const didWrite = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const existing = snap.exists ? ((snap.data() as any) ?? {}) : {};
    if (existing?.pro === true) return false;

    const existingSource =
      typeof existing?.source === "string" ? String(existing.source) : "";
    const isPaidSource = existingSource === "iap" || existingSource === "stripe";
    const nextSource = isPaidSource ? existingSource : "admin";

    const hasGrantedAt = existing?.grantedAt != null;
    const payload: Record<string, unknown> = {
      pro: true,
      source: nextSource,
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (!hasGrantedAt) payload.grantedAt = FieldValue.serverTimestamp();

    tx.set(ref, payload, { merge: true });
    return true;
  });

  return { didWrite };
}

