import {
  CallableRequest,
  HttpsError,
  onCall,
} from "firebase-functions/v2/https";
import type { Timestamp } from "firebase-admin/firestore";
import type { File } from "@google-cloud/storage";

import { getAuth, getFirestore, getStorage } from "./firebase.js";
import { buildScanPhotoPath, isScanPose } from "./scan/paths.js";

const auth = getAuth();
const db = getFirestore();
const storage = getStorage();

function getRequestId(request: CallableRequest<unknown>): string {
  const raw = request.rawRequest as
    | { headers?: Record<string, string | string[]> }
    | undefined;
  const header = raw?.headers || {};
  const id =
    (typeof header["x-firebase-functions-request-id"] === "string"
      ? header["x-firebase-functions-request-id"]
      : Array.isArray(header["x-firebase-functions-request-id"])
        ? header["x-firebase-functions-request-id"][0]
        : undefined) ||
    (typeof header["x-request-id"] === "string"
      ? header["x-request-id"]
      : Array.isArray(header["x-request-id"])
        ? header["x-request-id"][0]
        : undefined) ||
    "unknown";
  return id;
}

async function deleteFirestoreUser(
  uid: string,
  requestId: string
): Promise<void> {
  const ref = db.doc(`users/${uid}`);
  console.log("account_delete_firestore_begin", { uid, requestId });
  await db.recursiveDelete(ref);
  console.log("account_delete_firestore_complete", { uid, requestId });
}

async function deleteStorageUser(
  uid: string,
  requestId: string
): Promise<void> {
  const bucket = storage.bucket();
  const prefixes = [`scans/${uid}/`, `user_uploads/${uid}/`];
  let pageToken: string | undefined;
  console.log("account_delete_storage_begin", { uid, requestId });
  try {
    for (const prefix of prefixes) {
      pageToken = undefined;
      do {
        const [files, , response] = await bucket.getFiles({
          prefix,
          autoPaginate: false,
          pageToken,
        });
        const deletions = files.map(async (file: File) => {
          try {
            await file.delete();
          } catch (err) {
            console.warn("account_storage_delete_error", {
              uid,
              path: file.name,
              requestId,
              message: (err as Error)?.message,
            });
          }
        });
        await Promise.allSettled(deletions);
        pageToken = (response as { nextPageToken?: string } | undefined)
          ?.nextPageToken;
      } while (pageToken);
    }
  } catch (err) {
    console.warn("account_storage_list_error", {
      uid,
      requestId,
      message: (err as Error)?.message,
    });
  }
  console.log("account_delete_storage_complete", { uid, requestId });
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

type ExportImage = { name: string; url: string; expiresAt: string };

function requestOrigin(request: CallableRequest<unknown>): string {
  const raw = request.rawRequest as
    | { headers?: Record<string, string | string[] | undefined> }
    | undefined;
  const headers = raw?.headers || {};
  const getHeader = (key: string): string => {
    const v = headers[key];
    if (typeof v === "string") return v.trim();
    if (Array.isArray(v) && typeof v[0] === "string") return v[0].trim();
    return "";
  };
  const origin = getHeader("origin");
  if (origin) return origin.replace(/\/+$/, "");
  const proto =
    getHeader("x-forwarded-proto") || getHeader("x-forwarded-protocol") || "https";
  const host = getHeader("x-forwarded-host") || getHeader("host") || "mybodyscanapp.com";
  return `${proto}://${host}`.replace(/\/+$/, "");
}

async function buildImageExport(
  uid: string,
  scanId: string,
  poses: string[],
  expiresAt: string,
  baseUrl: string
): Promise<ExportImage[]> {
  const bucket = storage.bucket();
  const results: ExportImage[] = [];

  await Promise.all(
    poses.map(async (pose) => {
      if (!isScanPose(pose)) return;
      const path = buildScanPhotoPath({ uid, scanId, pose });
      try {
        const file = bucket.file(path);
        const [exists] = await file.exists();
        if (!exists) return;
        const url = `${baseUrl}/api/scan/photo?${new URLSearchParams({ scanId, pose }).toString()}`;
        results.push({ name: pose, url, expiresAt });
      } catch (err) {
        console.warn("account_export_signed_url_error", {
          uid,
          scanId,
          pose,
          message: (err as Error)?.message,
        });
      }
    })
  );

  return results;
}

export const deleteMyAccount = onCall(
  { region: "us-central1" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError(
        "unauthenticated",
        "Sign in to delete your account."
      );
    }

    const requestId = getRequestId(request);
    console.log("account_delete_begin", { uid, requestId });

    try {
      await auth.revokeRefreshTokens(uid).catch((err: unknown) => {
        console.warn("account_revoke_error", {
          uid,
          requestId,
          message: (err as Error)?.message,
        });
      });
      await deleteFirestoreUser(uid, requestId);
      await deleteStorageUser(uid, requestId);
      await auth.deleteUser(uid);
      console.log("account_delete_complete", { uid, requestId });
      return { ok: true } as const;
    } catch (err) {
      console.error("account_delete_failed", {
        uid,
        requestId,
        message: (err as Error)?.message,
      });
      throw new HttpsError("internal", "Unable to delete account right now.");
    }
  }
);

export const exportMyData = onCall(
  { region: "us-central1" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Sign in to export your data.");
    }

    const requestId = getRequestId(request);
    const baseUrl = requestOrigin(request);
    console.log("account_export_begin", { uid, requestId });

    try {
      const profileSnap = await db.doc(`users/${uid}`).get();
      const profile = profileSnap.exists
        ? (profileSnap.data() as Record<string, unknown>)
        : null;

      const scansSnap = await db.collection(`users/${uid}/scans`).get();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      const items = await Promise.all(
        scansSnap.docs.map(
          async (
            docSnap: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>
          ) => {
            const raw = docSnap.data() as Record<string, unknown>;
            const metadata =
              raw &&
              typeof raw === "object" &&
              raw.metadata &&
              typeof (raw as Record<string, unknown>).metadata === "object"
                ? ((raw as { metadata: Record<string, unknown> })
                    .metadata as Record<string, unknown>)
                : {};
            const rawImages = metadata["images"];
            const poses: string[] = Array.isArray(rawImages)
              ? (rawImages as Array<{ pose?: string }>)
                  .map((entry) =>
                    typeof entry?.pose === "string" ? entry.pose : ""
                  )
                  .filter((pose) => pose.length > 0)
              : ["front", "back", "left", "right"];
            const uniquePoses = Array.from(new Set(poses));
            const images = await buildImageExport(
              uid,
              docSnap.id,
              uniquePoses,
              expiresAt,
              baseUrl
            );
            return {
              id: docSnap.id,
              status: typeof raw.status === "string" ? raw.status : "unknown",
              createdAt: normalizeTimestamp(raw.createdAt),
              completedAt: normalizeTimestamp(raw.completedAt),
              result: raw.result ?? null,
              metadata: { images },
            };
          }
        )
      );

      console.log("account_export_complete", {
        uid,
        requestId,
        scanCount: items.length,
      });
      return { ok: true as const, expiresAt, profile, scans: items };
    } catch (err) {
      console.error("account_export_failed", {
        uid,
        requestId,
        message: (err as Error)?.message,
      });
      throw new HttpsError("internal", "Unable to export data right now.");
    }
  }
);
