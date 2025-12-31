import { HttpsError } from "firebase-functions/v2/https";
import { onCallWithOptionalAppCheck } from "./util/callable.js";
import { getFirestore } from "./firebase.js";
import { ensureAdminProEntitlement } from "./lib/adminAllowlistPro.js";

export type SyncEntitlementsResponse = {
  ok: true;
  didWrite: boolean;
  entitlements: Record<string, unknown> | null;
};

/**
 * Best-effort entitlement sync called by the client after auth bootstrap.
 *
 * This fills the “no on-login trigger” gap by ensuring admin allowlist users
 * always have `users/{uid}/entitlements/current.pro === true`.
 */
export const syncEntitlements = onCallWithOptionalAppCheck(async (req) => {
  const uid = req.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Authentication required");
  }

  const tokenEmail = req.auth?.token?.email;
  const email = typeof tokenEmail === "string" ? tokenEmail : null;

  const ensured = await ensureAdminProEntitlement(uid, email);

  // Return the current SSoT doc so the client can reflect immediately.
  const db = getFirestore();
  const snap = await db.doc(`users/${uid}/entitlements/current`).get().catch(() => null);
  const entitlements = snap?.exists ? (((snap.data() as any) ?? {}) as any) : null;

  const res: SyncEntitlementsResponse = {
    ok: true,
    didWrite: ensured.didWrite,
    entitlements,
  };
  return res;
});

