import { HttpsError, onRequest } from "firebase-functions/v2/https";
import type { Request } from "firebase-functions/v2/https";
import { randomUUID } from "node:crypto";
import { Timestamp, getFirestore } from "../firebase.js";
import { requireAuthWithClaims, verifyAppCheck } from "../http.js";
import { getAppCheckMode, type AppCheckMode } from "../lib/env.js";
import { HttpError } from "../util/http.js";

const db = getFirestore();
const POSES = ["front", "back", "left", "right"] as const;

type Pose = (typeof POSES)[number];

interface StartResponse {
  scanId: string;
  storagePaths: Record<Pose, string>;
}

function buildStoragePath(uid: string, scanId: string, pose: Pose): string {
  return `scans/${uid}/${scanId}/${pose}.jpg`;
}

async function ensureAppCheck(req: Request, mode: AppCheckMode): Promise<void> {
  try {
    await verifyAppCheck(req, mode);
  } catch (error: any) {
    if (error instanceof HttpsError) {
      const code = error.message === "app_check_invalid" ? "app_check_invalid" : "app_check_required";
      throw new HttpError(401, code);
    }
    throw error;
  }
}

async function handleStart(req: Request, res: any) {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Firebase-AppCheck");
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed", code: "method_not_allowed" });
    return;
  }

  const appCheckMode = getAppCheckMode();
  try {
    await ensureAppCheck(req, appCheckMode);
  } catch (error: any) {
    if (error instanceof HttpError) {
      console.warn("scan_start_appcheck_failed", { mode: appCheckMode, code: error.code });
      res.status(error.status).json({ error: error.code, code: error.code });
      return;
    }
    console.warn("scan_start_appcheck_failed", { mode: appCheckMode, message: error?.message });
    res.status(401).json({ error: "app_check_required", code: "app_check_required" });
    return;
  }

  let authContext: { uid: string; claims?: Record<string, unknown> };
  try {
    authContext = await requireAuthWithClaims(req);
  } catch (error: any) {
    console.warn("scan_start_auth_failed", { message: error?.message });
    res.status(401).json({ error: "auth_required", code: "auth_required" });
    return;
  }

  const { uid } = authContext;
  const scanId = randomUUID();
  const now = Timestamp.now();
  const storagePaths: Record<Pose, string> = {
    front: buildStoragePath(uid, scanId, "front"),
    back: buildStoragePath(uid, scanId, "back"),
    left: buildStoragePath(uid, scanId, "left"),
    right: buildStoragePath(uid, scanId, "right"),
  };

  const currentWeightKg = Number(req.body?.currentWeightKg);
  const goalWeightKg = Number(req.body?.goalWeightKg);

  if (!Number.isFinite(currentWeightKg) || !Number.isFinite(goalWeightKg)) {
    res.status(400).json({
      code: "invalid_scan_request",
      message: "Missing or invalid scan data.",
    });
    return;
  }

  const doc: ScanDocument = {
    id: scanId,
    uid,
    createdAt: now,
    updatedAt: now,
    status: "pending",
    photoPaths: {
      front: "",
      back: "",
      left: "",
      right: "",
    },
    input: {
      currentWeightKg,
      goalWeightKg,
    },
    estimate: null,
    workoutPlan: null,
    nutritionPlan: null,
  };

  await db.doc(`users/${uid}/scans/${scanId}`).set(doc);

  const payload: StartResponse = { scanId, storagePaths };
  res.json(payload);
}

export const startScanSession = onRequest(
  { invoker: "public", concurrency: 20, region: "us-central1" },
  async (req, res) => {
    try {
      await handleStart(req as Request, res);
    } catch (err: any) {
      console.error("scan_start_unhandled", { message: err?.message });
      res.status(500).json({ error: "server_error", code: "server_error" });
    }
  },
);
