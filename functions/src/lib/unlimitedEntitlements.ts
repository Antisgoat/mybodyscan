import { getAuth, getFirestore, FieldValue } from "../firebase.js";

export type EnsureUnlimitedEntitlementsParams = {
  uid: string;
  email?: string | null;
  provider?: string | null;
  source: "refreshClaims" | "systemBootstrap" | "authTrigger" | "adminGrant";
};

export type EnsureUnlimitedEntitlementsResult = {
  didGrant: boolean;
  didSetClaims: boolean;
  didWriteFirestore: boolean;
  pathsUpdated: string[];
};

const MAX_CREDITS = 999_999_999;

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export async function ensureUnlimitedEntitlements(
  params: EnsureUnlimitedEntitlementsParams
): Promise<EnsureUnlimitedEntitlementsResult> {
  const uid = String(params.uid || "").trim();
  if (!uid) {
    return {
      didGrant: false,
      didSetClaims: false,
      didWriteFirestore: false,
      pathsUpdated: [],
    };
  }

  const auth = getAuth();
  const db = getFirestore();

  // ---- Claims (custom claims are used server-side in scan gating) ----
  const userRecord = await auth.getUser(uid);
  const existingClaims =
    userRecord.customClaims && typeof userRecord.customClaims === "object"
      ? (userRecord.customClaims as Record<string, unknown>)
      : {};
  const hasClaim = existingClaims.unlimitedCredits === true;

  let didSetClaims = false;
  if (!hasClaim) {
    await auth.setCustomUserClaims(uid, { ...existingClaims, unlimitedCredits: true });
    didSetClaims = true;
  }

  // ---- Firestore mirrors (used by UI + server-side fast bypass) ----
  const entitlementsRef = db.doc(`users/${uid}/private/entitlements`);
  const adminMirrorRef = db.doc(`users/${uid}/private/admin`);
  const userRootRef = db.doc(`users/${uid}`);
  const proEntitlementsRef = db.doc(`users/${uid}/entitlements/current`);

  const [entSnap, adminSnap, rootSnap, proSnap] = await Promise.all([
    entitlementsRef.get().catch(() => null),
    adminMirrorRef.get().catch(() => null),
    userRootRef.get().catch(() => null),
    proEntitlementsRef.get().catch(() => null),
  ]);

  const entOk =
    entSnap?.exists && (entSnap.data() as any)?.unlimitedCredits === true;
  const adminOk =
    adminSnap?.exists && (adminSnap.data() as any)?.unlimitedCredits === true;
  const rootOk =
    rootSnap?.exists && (rootSnap.data() as any)?.unlimitedCredits === true;
  const proOk = proSnap?.exists && (proSnap.data() as any)?.pro === true;

  const needEntitlements = !entOk;
  const needAdminMirror = !adminOk;
  const needUserRoot = !rootOk;
  const needProEntitlements = !proOk;

  let didWriteFirestore = false;
  const pathsUpdated: string[] = [];

  if (needEntitlements || needAdminMirror || needUserRoot || needProEntitlements) {
    const updatedAt = FieldValue.serverTimestamp();
    const payload = {
      unlimitedCredits: true,
      credits: MAX_CREDITS,
      updatedAt,
    };
    const proPayload = {
      pro: true,
      source: "admin",
      expiresAt: null,
      updatedAt,
    };

    const writes: Promise<unknown>[] = [];
    if (needEntitlements) {
      writes.push(entitlementsRef.set(payload, { merge: true }));
      pathsUpdated.push(`users/${uid}/private/entitlements`);
    }
    if (needAdminMirror) {
      writes.push(
        adminMirrorRef.set(
          {
            ...payload,
            unlimitedCreditsUpdatedAt: updatedAt,
          },
          { merge: true }
        )
      );
      pathsUpdated.push(`users/${uid}/private/admin`);
    }
    if (needUserRoot) {
      writes.push(
        userRootRef.set(
          {
            ...payload,
            unlimitedCreditsUpdatedAt: updatedAt,
          },
          { merge: true }
        )
      );
      pathsUpdated.push(`users/${uid}`);
    }
    if (needProEntitlements) {
      writes.push(proEntitlementsRef.set(proPayload, { merge: true }));
      pathsUpdated.push(`users/${uid}/entitlements/current`);
    }

    await Promise.all(writes);
    didWriteFirestore = true;
  }

  const didGrant = didSetClaims || didWriteFirestore;

  // Structured log for ops/debugging (do not leak tokens).
  console.info("unlimited_entitlements_ensure", {
    uid,
    email: asString(params.email || ""),
    provider: asString(params.provider || ""),
    source: params.source,
    didGrant,
    didSetClaims,
    didWriteFirestore,
    pathsUpdated,
  });

  return { didGrant, didSetClaims, didWriteFirestore, pathsUpdated };
}

