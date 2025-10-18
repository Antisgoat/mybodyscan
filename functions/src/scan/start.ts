import { onRequest } from "firebase-functions/v2/https";
import type { Request } from "firebase-functions/v2/https";
import { randomUUID } from "node:crypto";
import { getFirestore, getStorage, Timestamp } from "../firebase.js";
import { requireAuth, requireAuthWithClaims, verifyAppCheckStrict } from "../http.js";
import { withRequestLogging } from "../middleware/logging.js";
import { isStaff } from "../claims.js";

const db = getFirestore();
const storage = getStorage();
const UPLOAD_EXPIRATION_MS = 10 * 60 * 1000; // 10 minutes
const IDEMPOTENCY_WINDOW_MS = 2 * 60 * 1000; // 2 minutes
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

  // Idempotent session: reuse recent scanId for the same user within a short window
  const sessionRef = db.doc(`users/${uid}/private/scanSession`);
  const now = Timestamp.now();
  const nowMs = Date.now();
  let scanId = randomUUID();
  let expiresAt = new Date(nowMs + UPLOAD_EXPIRATION_MS);

  try {
    await db.runTransaction(async (tx: FirebaseFirestore.Transaction) => {
      const snap = (await tx.get(sessionRef)) as unknown as FirebaseFirestore.DocumentSnapshot<FirebaseFirestore.DocumentData>;
      const existing = snap.exists ? (snap.data() as any) : null;
      const createdAt: Timestamp | null = existing?.createdAt instanceof Timestamp ? existing.createdAt : null;
      const withinWindow = createdAt ? now.toMillis() - createdAt.toMillis() <= IDEMPOTENCY_WINDOW_MS : false;
      if (existing && typeof existing.scanId === "string" && withinWindow) {
        scanId = existing.scanId as string;
      } else {
        scanId = randomUUID();
      }
      const nextExpires = Timestamp.fromMillis(nowMs + UPLOAD_EXPIRATION_MS);
      tx.set(
        sessionRef,
        {
          scanId,
          createdAt: withinWindow && createdAt ? createdAt : now,
          expiresAt: nextExpires,
          status: "open",
          updatedAt: now,
        },
        { merge: true }
      );
      expiresAt = new Date(nextExpires.toMillis());
    });
  } catch (err) {
    console.warn("scan_start_session_tx_error", { uid, message: (err as any)?.message });
    // Fallback to a fresh session if transaction fails
    scanId = randomUUID();
    expiresAt = new Date(nowMs + UPLOAD_EXPIRATION_MS);
  }
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
  withRequestLogging(async (req, res) => {
    try {
      await handleStart(req as Request, res);
    } catch (err: any) {
      console.error("scan_start_unhandled", { message: err?.message });
      res.status(500).json({ error: "server_error" });
    }
  }, { sampleRate: 0.5 })
);

