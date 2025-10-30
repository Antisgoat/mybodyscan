import { HttpsError, onCall } from "firebase-functions/v2/https";
import type { Timestamp } from "firebase-admin/firestore";

import { getAuth, getFirestore, getStorage } from "./firebase.js";

const auth = getAuth();
const db = getFirestore();
const storage = getStorage();

async function deleteFirestoreUser(uid: string): Promise<void> {
  const ref = db.doc(`users/${uid}`);
  await db.recursiveDelete(ref);
}

async function deleteStorageUser(uid: string): Promise<void> {
  try {
    await storage.bucket().deleteFiles({ prefix: `user_uploads/${uid}/` });
  } catch (err) {
    console.warn("account_storage_delete_error", { uid, message: (err as Error)?.message });
  }
}

function normalizeTimestamp(value: unknown): number | null {
  if (!value) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const ts = value as Timestamp | { toMillis?: () => number };
  if (typeof ts?.toMillis === "function") {
    try {
      const millis = ts.toMillis();
      return Number.isFinite(millis) ? millis : null;
    } catch {
      return null;
    }
  }
  return null;
}

async function buildImageExport(uid: string, scanId: string, poses: string[]): Promise<Array<{ pose: string; url: string }>> {
  const bucket = storage.bucket();
  const expires = Date.now() + 10 * 60 * 1000;
  const results: Array<{ pose: string; url: string }> = [];

  await Promise.all(
    poses.map(async (pose) => {
      const path = `user_uploads/${uid}/${scanId}/${pose}.jpg`;
      try {
        const file = bucket.file(path);
        const [exists] = await file.exists();
        if (!exists) return;
        const [url] = await file.getSignedUrl({
          version: "v4",
          action: "read",
          expires,
        });
        results.push({ pose, url });
      } catch (err) {
        console.warn("account_export_signed_url_error", { uid, scanId, pose, message: (err as Error)?.message });
      }
    })
  );

  return results;
}

export const deleteMyAccount = onCall({ region: "us-central1" }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Sign in to delete your account.");
  }

  try {
    await Promise.all([deleteFirestoreUser(uid), deleteStorageUser(uid)]);
    await auth.revokeRefreshTokens(uid).catch((err: unknown) => {
      console.warn("account_revoke_error", { uid, message: (err as Error)?.message });
    });
    await auth.deleteUser(uid);
    return { ok: true } as const;
  } catch (err) {
    console.error("account_delete_failed", { uid, message: (err as Error)?.message });
    throw new HttpsError("internal", "Unable to delete account right now.");
  }
});

export const createExportIndex = onCall({ region: "us-central1" }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Sign in to export your data.");
  }

  try {
    const scansSnap = await db.collection(`users/${uid}/scans`).get();
    const items = await Promise.all(
      scansSnap.docs.map(async (docSnap: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>) => {
        const raw = docSnap.data() as Record<string, unknown>;
        const metadata =
          raw && typeof raw === "object" && raw.metadata && typeof (raw as Record<string, unknown>).metadata === "object"
            ? ((raw as { metadata: Record<string, unknown> }).metadata as Record<string, unknown>)
            : {};
        const rawImages = metadata["images"];
        const poses: string[] = Array.isArray(rawImages)
          ? (rawImages as Array<{ pose?: string }>).
              map((entry) => (typeof entry?.pose === "string" ? entry.pose : ""))
              .filter((pose) => pose.length > 0)
          : ["front", "back", "left", "right"];
        const uniquePoses = Array.from(new Set(poses));
        const images = await buildImageExport(uid, docSnap.id, uniquePoses);
        return {
          id: docSnap.id,
          status: typeof raw.status === "string" ? raw.status : "unknown",
          createdAt: normalizeTimestamp(raw.createdAt),
          completedAt: normalizeTimestamp(raw.completedAt),
          result: raw.result ?? null,
          metadata: { images },
        };
      })
    );

    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    return { ok: true as const, expiresAt, scans: items };
  } catch (err) {
    console.error("account_export_failed", { uid, message: (err as Error)?.message });
    throw new HttpsError("internal", "Unable to export data right now.");
  }
});
