import { FieldValue, getFirestore } from "../firebase.js";

function normalizeUid(uid?: string | null): string | null {
  if (typeof uid !== "string") return null;
  const v = uid.trim();
  return v ? v : null;
}

export type EnsureAdminGrantedProEntitlementDeps = {
  db?: ReturnType<typeof getFirestore>;
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

    const existingSource =
      typeof existing?.source === "string" ? String(existing.source) : "";
    const existingExpiresAt = existing?.expiresAt ?? undefined;
    const existingGrantedAt = existing?.grantedAt ?? undefined;

    const alreadyCorrect =
      existing?.pro === true &&
      (existingSource === "admin" || existingSource === "admin_allowlist") &&
      existingExpiresAt === null;
    if (alreadyCorrect) return false;

    const payload: Record<string, unknown> = {
      pro: true,
      source: "admin",
      expiresAt: null,
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (existingGrantedAt == null) payload.grantedAt = FieldValue.serverTimestamp();

    tx.set(ref, payload, { merge: true });
    return true;
  });

  return { didWrite };
}

