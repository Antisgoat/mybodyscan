import { HttpsError } from "firebase-functions/v2/https";
import { onCallWithOptionalAppCheck } from "../util/callable.js";
import { FieldValue, getAuth, getFirestore } from "../firebase.js";

export type GrantProAllowlistRequest = {
  emails?: string[];
  uids?: string[];
};

export type GrantProAllowlistResponse = {
  ok: true;
  grantedUids: string[];
  alreadyProUids: string[];
  resolvedEmails: Record<string, string>;
  notFoundEmails: string[];
  invalidEmails: string[];
  invalidUids: string[];
};

type Deps = {
  auth?: ReturnType<typeof getAuth>;
  db?: ReturnType<typeof getFirestore>;
};

function normalizeEmail(email: unknown): string | null {
  if (typeof email !== "string") return null;
  const v = email.trim().toLowerCase();
  if (!v) return null;
  // Basic sanity check; Auth SDK will enforce stricter validity.
  if (!v.includes("@")) return null;
  return v;
}

function normalizeUid(uid: unknown): string | null {
  if (typeof uid !== "string") return null;
  const v = uid.trim();
  return v ? v : null;
}

function isAllowedCallerEmail(email: string | null): boolean {
  if (!email) return false;
  const e = email.trim().toLowerCase();
  if (!e) return false;
  if (e === "developer@adlrlabs.com") return true;
  return e.endsWith("@adlrlabs.com");
}

async function isFirestoreAdminUid(uid: string, deps: Deps): Promise<boolean> {
  // Optional pattern: allow if `admins/{uid}` exists and contains a truthy flag.
  // If this collection isn't used, we simply won't find any matching doc.
  const db = deps.db ?? getFirestore();
  const snap = await db.doc(`admins/${uid}`).get().catch(() => null);
  if (!snap?.exists) return false;
  const data = (snap.data() as any) ?? {};
  return (
    data === true ||
    data?.admin === true ||
    data?.enabled === true ||
    data?.isAdmin === true ||
    data?.allow === true ||
    data?.allowed === true
  );
}

async function writeAdminProEntitlement(uid: string, deps: Deps): Promise<{ didWrite: boolean; alreadyPro: boolean }> {
  const db = deps.db ?? getFirestore();
  const ref = db.doc(`users/${uid}/entitlements/current`);
  const didWrite = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const existing = snap.exists ? ((snap.data() as any) ?? {}) : {};
    const existingSource = typeof existing?.source === "string" ? String(existing.source) : "";
    const isPaidSource = existingSource === "iap" || existingSource === "stripe";
    const nextSource = isPaidSource ? existingSource : "admin";

    const alreadyPro = existing?.pro === true;
    const hasGrantedAt = existing?.grantedAt != null;
    const payload: Record<string, unknown> = {
      pro: true,
      source: nextSource,
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (!hasGrantedAt) {
      payload.grantedAt = FieldValue.serverTimestamp();
    }
    tx.set(ref, payload, { merge: true });
    return !alreadyPro;
  });

  const after = await ref.get().catch(() => null);
  const data = after?.exists ? ((after.data() as any) ?? {}) : {};
  return { didWrite, alreadyPro: data?.pro === true && !didWrite };
}

export async function grantProAllowlistCore(
  req: { auth?: { uid?: string; token?: Record<string, unknown> } | null; data?: unknown },
  deps: Deps = {}
): Promise<GrantProAllowlistResponse> {
  const callerUid = req.auth?.uid ? String(req.auth.uid) : "";
  if (!callerUid) throw new HttpsError("unauthenticated", "Authentication required");

  const tokenEmail = req.auth?.token?.email;
  const callerEmail = typeof tokenEmail === "string" ? tokenEmail : null;
  const allowedByEmail = isAllowedCallerEmail(callerEmail);
  const allowedByAdminsDoc = allowedByEmail ? false : await isFirestoreAdminUid(callerUid, deps);
  if (!allowedByEmail && !allowedByAdminsDoc) {
    throw new HttpsError("permission-denied", "Admin access required");
  }

  const raw = (req.data ?? {}) as any;
  const emailsIn = Array.isArray(raw?.emails) ? raw.emails : [];
  const uidsIn = Array.isArray(raw?.uids) ? raw.uids : [];

  const invalidEmails: string[] = [];
  const invalidUids: string[] = [];
  const requestedEmails = emailsIn.map(normalizeEmail).filter((v, i) => {
    if (!v) invalidEmails.push(String(emailsIn[i] ?? ""));
    return Boolean(v);
  }) as string[];
  const requestedUids = uidsIn.map(normalizeUid).filter((v, i) => {
    if (!v) invalidUids.push(String(uidsIn[i] ?? ""));
    return Boolean(v);
  }) as string[];

  // Safety: prevent accidental huge runs.
  const MAX = 50;
  if (requestedEmails.length + requestedUids.length > MAX) {
    throw new HttpsError("invalid-argument", `Too many targets (max ${MAX})`);
  }

  const auth = deps.auth ?? getAuth();

  const resolvedEmails: Record<string, string> = {};
  const notFoundEmails: string[] = [];
  const resolvedUids: string[] = [];

  for (const email of requestedEmails) {
    try {
      const user = await auth.getUserByEmail(email);
      const uid = typeof user?.uid === "string" ? user.uid : "";
      if (uid) {
        resolvedEmails[email] = uid;
        resolvedUids.push(uid);
      } else {
        notFoundEmails.push(email);
      }
    } catch (err: any) {
      const code = typeof err?.code === "string" ? err.code : "";
      if (code.includes("user-not-found")) {
        notFoundEmails.push(email);
      } else {
        // Fail closed for unexpected errors.
        throw new HttpsError("internal", `Failed to resolve email: ${email}`);
      }
    }
  }

  const targets = new Set<string>([...resolvedUids, ...requestedUids]);
  const grantedUids: string[] = [];
  const alreadyProUids: string[] = [];

  for (const uid of targets) {
    const res = await writeAdminProEntitlement(uid, deps);
    if (res.didWrite) grantedUids.push(uid);
    else alreadyProUids.push(uid);
  }

  return {
    ok: true,
    grantedUids: grantedUids.sort(),
    alreadyProUids: alreadyProUids.sort(),
    resolvedEmails,
    notFoundEmails: notFoundEmails.sort(),
    invalidEmails,
    invalidUids,
  };
}

export const grantProAllowlist = onCallWithOptionalAppCheck(async (req) => {
  return grantProAllowlistCore(req as any);
});

