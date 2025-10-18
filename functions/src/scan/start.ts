import { onRequest } from "firebase-functions/v2/https";
import type { Request } from "firebase-functions/v2/https";
import { randomUUID } from "node:crypto";
import { getFirestore, getStorage } from "../firebase.js";
import { requireAuth, requireAuthWithClaims, verifyAppCheckStrict } from "../http.js";
import { withRequestLogging } from "../middleware/logging.js";
import { isStaff } from "../claims.js";

const db = getFirestore();
const storage = getStorage();
const UPLOAD_EXPIRATION_MS = 10 * 60 * 1000; // 10 minutes
const SESSION_REUSE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes - reuse session within this window
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
  return `uploads/${uid}/${scanId}/${pose}.jpg`;
}

async function getOrCreateSession(uid: string): Promise<{ scanId: string; isReused: boolean }> {
  const now = Date.now();
  const cutoff = now - SESSION_REUSE_WINDOW_MS;
  
  // Check for existing active session within the reuse window
  const sessionsRef = db.collection(`users/${uid}/private/sessions`);
  const recentSessions = await sessionsRef
    .where("createdAt", ">=", new Date(cutoff))
    .where("status", "==", "active")
    .orderBy("createdAt", "desc")
    .limit(1)
    .get();

  if (!recentSessions.empty) {
    const sessionDoc = recentSessions.docs[0];
    const sessionData = sessionDoc.data();
    const scanId = sessionDoc.id;
    
    // Verify the session is still valid (not expired)
    if (sessionData.expiresAt && sessionData.expiresAt.toMillis() > now) {
      console.info("scan_start_reusing_session", { uid, scanId, isReused: true });
      return { scanId, isReused: true };
    }
  }

  // Create new session
  const scanId = randomUUID();
  const expiresAt = new Date(now + UPLOAD_EXPIRATION_MS);
  
  await sessionsRef.doc(scanId).set({
    status: "active",
    createdAt: new Date(now),
    expiresAt: new Date(expiresAt),
    uid,
  });

  console.info("scan_start_new_session", { uid, scanId, isReused: false });
  return { scanId, isReused: false };
}

async function handleStart(req: Request, res: any) {
  await verifyAppCheckStrict(req);
  const { uid, claims } = await requireAuthWithClaims(req);
  const staffBypass = await isStaff(uid);
  const unlimitedCredits = claims?.unlimitedCredits === true || claims?.tester === true;

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
    res.status(402).json({ error: "no_credits" });
    return;
  }

  const { scanId, isReused } = await getOrCreateSession(uid);
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
    res.status(500).json({ error: "signing_failed" });
    return;
  }

  console.info("scan_start", { uid, scanId, isReused, expiresAt: expiresAt.toISOString() });

  const payload: StartResponse = {
    scanId,
    uploadUrls,
    expiresAt: expiresAt.toISOString(),
  };

  res.json(payload);
}

export const startScanSession = onRequest(
  { invoker: "public", concurrency: 20, region: "us-central1" },
  withRequestLogging(async (req, res) => {
    try {
      await handleStart(req as Request, res);
    } catch (err: any) {
      console.error("scan_start_unhandled", { message: err?.message });
      res.status(500).json({ error: "server_error" });
    }
  }, { sampleRate: 0.5 })
);

