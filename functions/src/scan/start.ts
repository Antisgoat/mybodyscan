import { HttpsError, onRequest } from "firebase-functions/v2/https";
import type { Request } from "firebase-functions/v2/https";
import { randomUUID } from "node:crypto";
import { getFirestore, getStorage } from "../firebase.js";
import { requireAuthWithClaims, verifyAppCheck } from "../http.js";
import { isStaff } from "../claims.js";
import { getAppCheckMode, type AppCheckMode } from "../lib/env.js";
import { HttpError } from "../util/http.js";

const db = getFirestore();
const storage = getStorage();
const UPLOAD_EXPIRATION_MS = 10 * 60 * 1000; // 10 minutes
const POSES = ["front", "back", "left", "right"] as const;

type Pose = (typeof POSES)[number];

interface StartResponse {
  scanId: string;
  uploadUrls: Record<Pose, string>;
  expiresAt: string;
}

async function hasFounderBypass(uid: string): Promise<boolean> {
  try {
    const snap = await db.doc(`users/${uid}`).get();
    if (!snap.exists) return false;
    const data = snap.data() as any;
    return Boolean(data?.meta?.founder);
  } catch (err) {
    console.warn("scan_start_founder_lookup_error", { uid, message: (err as any)?.message });
    return false;
  }
}

async function hasAvailableCredits(uid: string): Promise<boolean> {
  try {
    const snap = await db.doc(`users/${uid}/private/credits`).get();
    if (!snap.exists) return false;
    const data = snap.data() as any;
    const total = Number(data?.creditsSummary?.totalAvailable ?? 0);
    return Number.isFinite(total) && total > 0;
  } catch (err) {
    console.warn("scan_start_credit_lookup_error", { uid, message: (err as any)?.message });
    return false;
  }
}

async function createSignedUploadUrl(path: string, expires: Date): Promise<string> {
  const bucket = storage.bucket();
  const file = bucket.file(path);
  const [url] = await file.getSignedUrl({
    version: "v4",
    action: "write",
    expires,
    contentType: "image/jpeg",
  });
  return url;
}

function buildUploadPath(uid: string, scanId: string, pose: Pose): string {
  return `user_uploads/${uid}/${scanId}/${pose}.jpg`;
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
  const { uid, claims } = authContext;
  const staffBypass = await isStaff(uid);
  const unlimitedCredits = claims?.unlimitedCredits === true;

  if (staffBypass) {
    console.info("scan_start_staff_bypass", { uid });
  }
  
  if (unlimitedCredits) {
    console.info("scan_start_unlimited_credits", { uid });
  }

  const [founder, hasCredits] = staffBypass || unlimitedCredits
    ? [false, true]
    : await Promise.all([
        hasFounderBypass(uid),
        hasAvailableCredits(uid),
      ]);

  if (!staffBypass && !unlimitedCredits && !founder && !hasCredits) {
    console.warn("scan_start_no_credits", { uid });
    res.status(402).json({ error: "no_credits", code: "no_credits" });
    return;
  }

  const scanId = randomUUID();
  const expiresAt = new Date(Date.now() + UPLOAD_EXPIRATION_MS);
  const uploadUrls: Record<Pose, string> = {
    front: "",
    back: "",
    left: "",
    right: "",
  };

  try {
    await Promise.all(
      POSES.map(async (pose) => {
        const path = buildUploadPath(uid, scanId, pose);
        const url = await createSignedUploadUrl(path, expiresAt);
        uploadUrls[pose] = url;
      })
    );
  } catch (err) {
    console.error("scan_start_signed_url_error", { uid, scanId, message: (err as any)?.message });
    res.status(500).json({ error: "signing_failed", code: "signing_failed" });
    return;
  }

  console.info("scan_start", { uid, scanId, expiresAt: expiresAt.toISOString() });

  const payload: StartResponse = {
    scanId,
    uploadUrls,
    expiresAt: expiresAt.toISOString(),
  };

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
  }
);

