import { HttpsError, onRequest } from "firebase-functions/v2/https";
import type { Request } from "firebase-functions/v2/https";
import { randomUUID } from "node:crypto";
import { Timestamp, getFirestore } from "../firebase.js";
import { requireAuthWithClaims } from "../http.js";
import { ensureSoftAppCheckFromRequest } from "../lib/appCheckSoft.js";
import type { ScanDocument } from "../types.js";

const db = getFirestore();
const POSES = ["front", "back", "left", "right"] as const;

type Pose = (typeof POSES)[number];

interface StartResponse {
  scanId: string;
  storagePaths: Record<Pose, string>;
}

function buildStoragePath(uid: string, scanId: string, pose: Pose): string {
  return `user_uploads/${uid}/${scanId}/${pose}.jpg`;
}

async function handleStart(req: Request, res: any) {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Firebase-AppCheck");
  const requestId = req.get("x-request-id")?.trim() || randomUUID();
  res.set("X-Request-Id", requestId);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ code: "method_not_allowed", message: "Method not allowed", debugId: requestId });
    return;
  }

  try {
    const authContext = await requireAuthWithClaims(req);
    const { uid } = authContext;
    await ensureSoftAppCheckFromRequest(req, { fn: "startScanSession", uid, requestId });

    const currentWeightKg = Number(req.body?.currentWeightKg);
    const goalWeightKg = Number(req.body?.goalWeightKg);
    if (!Number.isFinite(currentWeightKg) || !Number.isFinite(goalWeightKg)) {
      throw new HttpsError("invalid-argument", "Missing or invalid scan data.", {
        debugId: requestId,
        reason: "invalid_scan_request",
      });
    }

    const scanId = randomUUID();
    const now = Timestamp.now() as FirebaseFirestore.Timestamp;
    const storagePaths: Record<Pose, string> = {
      front: buildStoragePath(uid, scanId, "front"),
      back: buildStoragePath(uid, scanId, "back"),
      left: buildStoragePath(uid, scanId, "left"),
      right: buildStoragePath(uid, scanId, "right"),
    };

    const doc: ScanDocument = {
      id: scanId,
      uid,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      status: "pending",
      photoPaths: storagePaths,
      input: {
        currentWeightKg,
        goalWeightKg,
      },
      estimate: null,
      workoutPlan: null,
      nutritionPlan: null,
    };

    await db.doc(`users/${uid}/scans/${scanId}`).set(doc);
    console.info("scan_start_created", { uid, scanId, requestId });

    const payload: StartResponse & { debugId: string } = { scanId, storagePaths, debugId: requestId };
    res.json(payload);
  } catch (error) {
    respondWithStartError(res, error, requestId);
  }
}

export const startScanSession = onRequest(
  { invoker: "public", concurrency: 20, region: "us-central1" },
  async (req, res) => {
    try {
      await handleStart(req as Request, res);
    } catch (err: any) {
      const requestId = req.get?.("x-request-id")?.trim() || randomUUID();
      console.error("scan_start_unhandled", { message: err?.message, requestId });
      res.status(500).json({ code: "scan_internal_error", message: "Unable to start scan.", debugId: requestId });
    }
  },
);

function respondWithStartError(res: any, error: unknown, requestId: string): void {
  if (error instanceof HttpsError) {
    const details = (error as { details?: any }).details || {};
    const debugId = details?.debugId ?? requestId;
    const reason = details?.reason;
    res.status(statusFromHttpsError(error)).json({
      code: error.code,
      message: error.message || "Unable to start scan.",
      debugId,
      reason,
    });
    return;
  }
  console.error("scan_start_failed", { message: (error as Error)?.message, requestId });
  res.status(500).json({
    code: "scan_internal_error",
    message: "Unable to start scan.",
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
    case "unauthenticated":
      return 401;
    case "permission-denied":
      return 403;
    default:
      return 500;
  }
}
