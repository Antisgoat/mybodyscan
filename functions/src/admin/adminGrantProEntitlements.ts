import { HttpsError } from "firebase-functions/v2/https";
import { onCallWithOptionalAppCheck } from "../util/callable.js";
import { FieldValue, getFirestore } from "../firebase.js";

export type AdminGrantProEntitlementsRequest = {
  uids: string[];
  pro?: boolean;
};

export type AdminGrantProEntitlementsResponse = {
  updated: string[];
  failed: Array<{ uid: string; error: string }>;
};

function normalizeUid(uid: unknown): string | null {
  if (typeof uid !== "string") return null;
  const v = uid.trim();
  return v ? v : null;
}

function requireDeveloperEmail(req: {
  auth?: { token?: Record<string, unknown> } | null;
}) {
  if (!req.auth) {
    throw new HttpsError("unauthenticated", "Authentication required");
  }
  const tokenEmail = req.auth?.token?.email;
  const email = typeof tokenEmail === "string" ? tokenEmail.trim().toLowerCase() : "";
  if (email !== "developer@adlrlabs.com") {
    throw new HttpsError(
      "permission-denied",
      "Admin access required (developer@adlrlabs.com)"
    );
  }
}

async function writeEntitlementsBatch(
  uids: string[],
  pro: boolean
): Promise<void> {
  const db = getFirestore();
  const batch = db.batch();
  for (const uid of uids) {
    const ref = db.doc(`users/${uid}/entitlements/current`);
    batch.set(
      ref,
      {
        pro,
        source: "admin",
        updatedAt: FieldValue.serverTimestamp(),
        expiresAt: null,
      },
      { merge: true }
    );
  }
  await batch.commit();
}

export const adminGrantProEntitlements = onCallWithOptionalAppCheck(
  async (req): Promise<AdminGrantProEntitlementsResponse> => {
    requireDeveloperEmail(req as any);

    const raw = (req.data ?? {}) as any;
    const uidsIn = Array.isArray(raw?.uids) ? raw.uids : null;
    if (!uidsIn) {
      throw new HttpsError("invalid-argument", "Expected { uids: string[] }");
    }

    const pro = typeof raw?.pro === "boolean" ? raw.pro : true;

    const invalid: string[] = [];
    const normalized = uidsIn
      .map(normalizeUid)
      .filter((v, i) => {
        if (!v) invalid.push(String(uidsIn[i] ?? ""));
        return Boolean(v);
      }) as string[];

    if (invalid.length) {
      throw new HttpsError(
        "invalid-argument",
        `Invalid uids: ${invalid.join(", ")}`
      );
    }

    const unique = Array.from(new Set(normalized));
    if (!unique.length) {
      throw new HttpsError("invalid-argument", "At least one uid is required");
    }

    // Safety: prevent accidental huge runs.
    const MAX_UIDS = 200;
    if (unique.length > MAX_UIDS) {
      throw new HttpsError(
        "invalid-argument",
        `Too many uids (max ${MAX_UIDS})`
      );
    }

    const updated: string[] = [];
    const failed: Array<{ uid: string; error: string }> = [];

    // Firestore batch limit is 500 writes; keep headroom.
    const CHUNK = 450;
    for (let i = 0; i < unique.length; i += CHUNK) {
      const chunk = unique.slice(i, i + CHUNK);
      try {
        await writeEntitlementsBatch(chunk, pro);
        updated.push(...chunk);
      } catch (err: any) {
        // If a batch fails, fall back to per-doc writes so we can report which uids failed.
        for (const uid of chunk) {
          try {
            await writeEntitlementsBatch([uid], pro);
            updated.push(uid);
          } catch (inner: any) {
            const msg =
              typeof inner?.message === "string" && inner.message.trim()
                ? inner.message.trim()
                : "write_failed";
            failed.push({ uid, error: msg });
          }
        }
      }
    }

    updated.sort();
    return { updated, failed };
  }
);

