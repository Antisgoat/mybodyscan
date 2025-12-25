/**
 * Pipeline map — Scan submission (async enqueue):
 * - Validates ownership, checks photo paths exist, and writes scan doc to `queued`.
 * - Returns immediately with a debug id; background worker handles heavy analysis.
 */
import { randomUUID } from "node:crypto";
import { HttpsError, onRequest } from "firebase-functions/v2/https";
import type { Request } from "firebase-functions/v2/https";
import { Timestamp, getFirestore, getStorage } from "../firebase.js";
import { requireAuthWithClaims } from "../http.js";
import { ensureSoftAppCheckFromRequest } from "../lib/appCheckSoft.js";
import { openAiSecretParam } from "../openai/keys.js";
import type { ScanDocument } from "../types.js";
import { deriveErrorReason } from "./analysis.js";
import { getEngineConfigOrThrow } from "./engineConfig.js";
import { buildScanPhotoPath, SCAN_POSES, type ScanPose } from "./paths.js";

const db = getFirestore();
const storage = getStorage();
const POSES = SCAN_POSES;

const serverTimestamp = (): FirebaseFirestore.Timestamp =>
  Timestamp.now() as FirebaseFirestore.Timestamp;

type Pose = ScanPose;

type SubmitPayload = {
  scanId: string;
  photoPaths: Record<Pose, string>;
  currentWeightKg: number;
  goalWeightKg: number;
  correlationId?: string;
};

function parsePayload(body: any): SubmitPayload | null {
  if (!body || typeof body !== "object") return null;
  const scanId = typeof body.scanId === "string" ? body.scanId.trim() : "";
  const photoPathsRaw =
    body.photoPaths && typeof body.photoPaths === "object"
      ? body.photoPaths
      : null;
  const currentWeightKg = Number(body.currentWeightKg);
  const goalWeightKg = Number(body.goalWeightKg);
  const correlationId =
    typeof body.correlationId === "string" && body.correlationId.trim()
      ? body.correlationId.trim().slice(0, 64)
      : undefined;
  if (!scanId || !photoPathsRaw) return null;
  const photoPaths: Record<Pose, string> = {
    front: typeof photoPathsRaw.front === "string" ? photoPathsRaw.front : "",
    back: typeof photoPathsRaw.back === "string" ? photoPathsRaw.back : "",
    left: typeof photoPathsRaw.left === "string" ? photoPathsRaw.left : "",
    right: typeof photoPathsRaw.right === "string" ? photoPathsRaw.right : "",
  };
  if (
    !photoPaths.front ||
    !photoPaths.back ||
    !photoPaths.left ||
    !photoPaths.right
  )
    return null;
  if (!Number.isFinite(currentWeightKg) || !Number.isFinite(goalWeightKg))
    return null;
  return { scanId, photoPaths, currentWeightKg, goalWeightKg, correlationId };
}

function buildDownloadUrl(params: { bucket: string; path: string; token: string }): string {
  // Token-based download URL (no signed URLs, no IAM signBlob).
  return `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(
    params.bucket
  )}/o/${encodeURIComponent(params.path)}?alt=media&token=${encodeURIComponent(params.token)}`;
}

function pickFirstDownloadToken(meta: any): string | null {
  const raw =
    typeof meta?.metadata?.firebaseStorageDownloadTokens === "string"
      ? meta.metadata.firebaseStorageDownloadTokens
      : typeof meta?.firebaseStorageDownloadTokens === "string"
        ? meta.firebaseStorageDownloadTokens
        : null;
  if (!raw) return null;
  const token = raw.split(",")[0]?.trim();
  return token ? token : null;
}

async function ensureDownloadToken(bucket: any, path: string): Promise<string | null> {
  const file = bucket.file(path);
  const [meta] = await file.getMetadata().catch(() => [null]);
  const existing = pickFirstDownloadToken(meta);
  if (existing) return existing;
  const created = randomUUID();
  // Firebase Storage download tokens are stored in the file metadata under `firebaseStorageDownloadTokens`.
  // This does NOT require signed URL generation.
  await file
    .setMetadata({
      metadata: {
        ...(meta?.metadata || {}),
        firebaseStorageDownloadTokens: created,
      },
    })
    .catch(() => undefined);
  return created;
}

async function verifyPhotoPathsAndBuildObjects(
  uid: string,
  scanId: string,
  paths: Record<Pose, string>
): Promise<Record<Pose, { bucket: string; path: string; downloadURL: string | null }>> {
  const bucket = storage.bucket();
  const bucketName = bucket.name;
  const photoObjects = {
    front: { bucket: bucketName, path: paths.front, downloadURL: null },
    back: { bucket: bucketName, path: paths.back, downloadURL: null },
    left: { bucket: bucketName, path: paths.left, downloadURL: null },
    right: { bucket: bucketName, path: paths.right, downloadURL: null },
  } as Record<Pose, { bucket: string; path: string; downloadURL: string | null }>;
  for (const pose of POSES) {
    const expected = buildScanPhotoPath({ uid, scanId, pose });
    const actual = paths[pose];
    if (actual !== expected) {
      throw new HttpsError(
        "invalid-argument",
        "Invalid photo path supplied.",
        {
          reason: "invalid_photo_paths",
          pose,
        }
      );
    }
    const file = bucket.file(actual);
    const [exists] = await file.exists().catch(() => [false]);
    if (!exists) {
      throw new HttpsError(
        "failed-precondition",
        "We could not find your uploaded photos. Please re-upload each angle and try again.",
        {
          reason: "missing_photos",
          pose,
        }
      );
    }
    const token = await ensureDownloadToken(bucket, actual);
    photoObjects[pose] = {
      bucket: bucketName,
      path: actual,
      downloadURL: token ? buildDownloadUrl({ bucket: bucketName, path: actual, token }) : null,
    };
  }
  return photoObjects;
}

export const submitScan = onRequest(
  {
    invoker: "public",
    concurrency: 20,
    region: "us-central1",
    timeoutSeconds: 60,
    secrets: [openAiSecretParam],
  },
  async (req, res) => {
    let scanRef: FirebaseFirestore.DocumentReference<ScanDocument> | null = null;
    const requestId = req.get?.("x-request-id")?.trim() || randomUUID();
    res.set("Access-Control-Allow-Origin", "*");
    res.set(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-Firebase-AppCheck"
    );
    res.set("X-Request-Id", requestId);

    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }

    try {
      if (req.method !== "POST") {
        throw new HttpsError("unimplemented", "Method not allowed.", {
          debugId: requestId,
          reason: "method_not_allowed",
        });
      }

      const authContext = await requireAuthWithClaims(req as Request);
      await ensureSoftAppCheckFromRequest(req as Request, {
        fn: "submitScan",
        uid: authContext.uid,
        requestId,
      });
      // Verify the engine + storage bucket exist before doing any work.
      getEngineConfigOrThrow(requestId);

      const payload = parsePayload(req.body);
      if (!payload) {
        throw new HttpsError(
          "invalid-argument",
          "Missing or invalid scan data.",
          {
            debugId: requestId,
            reason: "invalid_scan_request",
          }
        );
      }

      const { uid } = authContext;
      const docRef = db.doc(
        `users/${uid}/scans/${payload.scanId}`
      ) as FirebaseFirestore.DocumentReference<ScanDocument>;
      const snap = await docRef.get();
      if (!snap.exists) {
        throw new HttpsError("not-found", "Scan not found.", {
          debugId: requestId,
          reason: "scan_not_found",
        });
      }
      const existing = snap.data() as ScanDocument;
      if (existing.uid && existing.uid !== uid) {
        throw new HttpsError(
          "permission-denied",
          "Scan does not belong to this user.",
          {
            debugId: requestId,
            reason: "scan_wrong_owner",
          }
        );
      }
      scanRef = docRef;

      const photoObjects = await verifyPhotoPathsAndBuildObjects(
        uid,
        payload.scanId,
        payload.photoPaths
      );

      const correlationId =
        payload.correlationId || existing.correlationId || requestId;

      await scanRef.set(
        {
          status: "queued",
          updatedAt: serverTimestamp(),
          lastStep: "queued",
          lastStepAt: serverTimestamp(),
          completedAt: null,
          errorMessage: null,
          errorReason: null,
          errorInfo: null,
          progress: 0,
          correlationId,
          processingRequestedAt: serverTimestamp(),
          submitRequestId: requestId,
          photoPaths: payload.photoPaths,
          photoObjects,
          input: {
            currentWeightKg: payload.currentWeightKg,
            goalWeightKg: payload.goalWeightKg,
          },
        },
        { merge: true }
      );

      console.info("scan_submit_enqueued", {
        uid,
        scanId: payload.scanId,
        requestId,
        correlationId,
      });

      res.json({
        scanId: payload.scanId,
        debugId: requestId,
        correlationId,
      });
    } catch (error) {
      if (scanRef) {
        const errorMessage =
          error instanceof HttpsError
            ? error.message
            : "Unexpected error while processing scan.";
        const errorReason = deriveErrorReason(error);
        await scanRef
          .set(
            {
              status: "error",
              errorMessage,
              errorReason,
              errorInfo: {
                code: errorReason,
                message: errorMessage,
                stage: "submit",
                debugId: requestId,
              },
              lastStep: "error",
              lastStepAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
              completedAt: serverTimestamp(),
            },
            { merge: true }
          )
          .catch(() => undefined);
      }
      respondWithSubmitError(res, error, requestId);
    }
  }
);

function respondWithSubmitError(
  res: any,
  error: unknown,
  requestId: string
): void {
  if (error instanceof HttpsError) {
    const details = (error as { details?: any }).details || {};
    const debugId = details?.debugId ?? requestId;
    const reason = details?.reason;
    const missing = Array.isArray(details?.missing) ? details.missing : undefined;
    const normalizedCode =
      reason === "scan_engine_not_configured" ? "scan_engine_not_configured" : error.code;
    const normalizedStatus =
      reason === "scan_engine_not_configured" ? 503 : statusFromHttpsError(error);
    res.status(normalizedStatus).json({
      code: normalizedCode,
      message:
        error.code === "internal"
          ? "Unexpected error while processing scan."
          : error.message || "Unable to process scan.",
      debugId,
      reason,
      missing,
    });
    return;
  }
  console.error("scan_submit_unhandled", {
    message: (error as Error)?.message,
    stack: (error as Error)?.stack,
    requestId,
  });
  res.status(500).json({
    code: "scan_internal_error",
    message: "Unexpected error while processing scan.",
    debugId: requestId,
    reason: "server_error",
  });
}

function statusFromHttpsError(error: HttpsError): number {
  const status = (error as any)?.httpErrorCode?.status;
  if (typeof status === "number") {
    return status;
  }
  switch (error.code) {
    case "invalid-argument":
      return 400;
    case "failed-precondition":
      return 412;
    case "unavailable":
      return 503;
    case "unauthenticated":
      return 401;
    case "permission-denied":
      return 403;
    case "not-found":
      return 404;
    default:
      return 500;
  }
}
