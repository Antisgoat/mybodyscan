import { Timestamp } from "firebase-admin/firestore";
import { db, functions, getSecret } from "./admin";
import { requireCallableAuth, requireUserFromRequest } from "./auth";
import * as crypto from "node:crypto";

const replicateApiKey = getSecret("REPLICATE_API_KEY");
const processKey = getSecret("SCAN_PROCESS_KEY");

interface StartScanData {
  photoPaths?: string[];
  filename?: string;
  size?: number;
  contentType?: string;
}

function parseUidFromScanPath(path: string): string | null {
  const segments = path.split("/");
  const userIndex = segments.indexOf("users");
  if (userIndex >= 0 && segments.length > userIndex + 1) {
    return segments[userIndex + 1];
  }
  return null;
}

function randomWithin(hash: Buffer, index: number, min: number, max: number, decimals = 1): number {
  const value = hash[index % hash.length] / 255;
  const raw = min + value * (max - min);
  const factor = Math.pow(10, decimals);
  return Math.round(raw * factor) / factor;
}

function buildMockMetrics(uid: string, scanId: string) {
  const hash = crypto.createHash("sha256").update(`${uid}:${scanId}`).digest();
  const weight = randomWithin(hash, 0, 55, 105, 1);
  const bfPercent = randomWithin(hash, 1, 12, 32, 1);
  const heightMeters = randomWithin(hash, 2, 1.55, 1.95, 2);
  const bmi = Math.round((weight / (heightMeters * heightMeters)) * 10) / 10;
  const leanMass = Math.round(weight * (1 - bfPercent / 100) * 10) / 10;
  const muscleMass = Math.round((leanMass * (0.5 + hash[3] / 255 * 0.1)) * 10) / 10;
  const bmr = Math.round(1300 + (hash[4] / 255) * 900);
  const tee = Math.round(bmr * (1.3 + (hash[5] / 255) * 0.5));
  const visceralFat = Math.round(randomWithin(hash, 6, 6, 15, 1));
  return { weight, bfPercent, bmi, leanMass, muscleMass, bmr, tee, visceralFat };
}

async function queueScan(uid: string, photoPaths: string[]): Promise<{ scanId: string }> {
  if (photoPaths.length !== 4) {
    throw new functions.https.HttpsError("invalid-argument", "Exactly 4 photos are required");
  }
  const invalid = photoPaths.find((path) => !path.startsWith(`uploads/${uid}/`));
  if (invalid) {
    throw new functions.https.HttpsError("permission-denied", "Storage path does not belong to user");
  }
  const scanRef = db.collection(`users/${uid}/scans`).doc();
  const now = Timestamp.now();
  await scanRef.set({
    status: "queued",
    createdAt: now,
    updatedAt: now,
    photos: photoPaths,
    ownerUid: uid,
  });
  functions.logger.info("scan_queued", { uid, scanId: scanRef.id });
  return { scanId: scanRef.id };
}

async function provisionUpload(uid: string, data: StartScanData): Promise<{ scanId: string; uploadPathPrefix: string; status: string }> {
  const scanRef = db.collection(`users/${uid}/scans`).doc();
  const now = Timestamp.now();
  await scanRef.set({
    status: "awaiting_upload",
    createdAt: now,
    updatedAt: now,
    ownerUid: uid,
    uploadRequest: {
      filename: data.filename ?? null,
      size: data.size ?? null,
      contentType: data.contentType ?? null,
    },
  });
  const uploadPathPrefix = `uploads/${uid}/${scanRef.id}/`; // four photos expected later
  return { scanId: scanRef.id, uploadPathPrefix, status: "awaiting_upload" };
}

export const startScan = functions.https.onCall(async (data: StartScanData, context) => {
  const requestId = crypto.randomUUID();
  const uid = requireCallableAuth(context, requestId);
  if (Array.isArray(data?.photoPaths)) {
    return queueScan(uid, data.photoPaths);
  }
  if (data?.filename) {
    return provisionUpload(uid, data);
  }
  throw new functions.https.HttpsError("invalid-argument", "photoPaths are required");
});

export const getScanStatus = functions.https.onCall(async (data: { scanId: string }, context) => {
  const requestId = crypto.randomUUID();
  const uid = requireCallableAuth(context, requestId);
  const scanId = data?.scanId;
  if (!scanId) {
    throw new functions.https.HttpsError("invalid-argument", "scanId required");
  }
  const snap = await db.doc(`users/${uid}/scans/${scanId}`).get();
  if (!snap.exists) {
    throw new functions.https.HttpsError("not-found", "Scan not found");
  }
  const doc = snap.data() as any;
  const response: any = {
    scanId,
    status: doc.status,
  };
  if (doc.status === "completed" && doc.result) {
    response.result = doc.result;
  }
  return response;
});

export const processQueuedScanHttp = functions.https.onRequest(async (req, res) => {
  const requestId = crypto.randomUUID();
  if (req.method !== "POST" && req.method !== "GET") {
    res.status(405).set("Allow", "GET, POST").end();
    return;
  }
  if (processKey) {
    const authHeader = req.get("authorization") || "";
    const bearerMatch = authHeader.match(/^Bearer (.+)$/);
    const queryKey = req.query.key;
    const queryToken = Array.isArray(queryKey) ? queryKey[0] : queryKey;
    const token = bearerMatch ? bearerMatch[1] : queryToken;
    if (token !== processKey) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
  } else {
    const cronHeader = req.get("X-Appengine-Cron") || req.get("X-CloudScheduler");
    if (!cronHeader) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
  }
  try {
    const queued = await db
      .collectionGroup("scans")
      .where("status", "==", "queued")
      .orderBy("createdAt")
      .limit(5)
      .get();
    if (queued.empty) {
      res.json({ processed: 0 });
      return;
    }
    let processed = 0;
    for (const doc of queued.docs) {
      const uid = (doc.data().ownerUid as string | undefined) ?? parseUidFromScanPath(doc.ref.path);
      if (!uid) continue;
      const scanId = doc.id;
      const scanRef = db.doc(`users/${uid}/scans/${scanId}`);
      const snapshot = await scanRef.get();
      if (!snapshot.exists) continue;
      const scanData = snapshot.data() as any;
      if (scanData.status !== "queued") continue;
      await scanRef.update({ status: "processing", updatedAt: Timestamp.now() });
      let result;
      if (replicateApiKey) {
        // Placeholder for real integration; future implementation would invoke Replicate API
        result = buildMockMetrics(uid, scanId);
      } else {
        result = buildMockMetrics(uid, scanId);
      }
      const completedAt = Timestamp.now();
      await scanRef.set(
        {
          status: "completed",
          updatedAt: completedAt,
          completedAt,
          result: {
            ...result,
            photos: scanData.photos,
            completedAt,
          },
        },
        { merge: true }
      );
      processed += 1;
    }
    res.json({ processed });
  } catch (err: any) {
    functions.logger.error("process_scans_error", { requestId, error: err });
    res.status(500).json({ error: "Processing failed" });
  }
});

export const startScanSession = functions.https.onRequest(async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).set("Allow", "POST").end();
    return;
  }
  const requestId = crypto.randomUUID();
  try {
    const uid = await requireUserFromRequest(req, requestId);
    const payload = await provisionUpload(uid, req.body || {});
    res.json(payload);
  } catch (err: any) {
    const status = err instanceof functions.https.HttpsError && err.code === "unauthenticated" ? 401 : 500;
    res.status(status).json({ error: err?.message || "Failed" });
  }
});

export const submitScan = functions.https.onRequest(async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).set("Allow", "POST").end();
    return;
  }
  const requestId = crypto.randomUUID();
  try {
    const uid = await requireUserFromRequest(req, requestId);
    const { scanId, files } = req.body || {};
    if (!scanId || !Array.isArray(files) || files.length !== 4) {
      res.status(400).json({ error: "scanId and 4 files required" });
      return;
    }
    const invalid = files.find((path: string) => !path.startsWith(`uploads/${uid}/`));
    if (invalid) {
      res.status(403).json({ error: "Storage path mismatch" });
      return;
    }
    const scanRef = db.doc(`users/${uid}/scans/${scanId}`);
    await scanRef.set(
      {
        photos: files,
        status: "queued",
        updatedAt: Timestamp.now(),
      },
      { merge: true }
    );
    res.json({ scanId, status: "queued" });
  } catch (err: any) {
    const status = err instanceof functions.https.HttpsError && err.code === "unauthenticated" ? 401 : 500;
    res.status(status).json({ error: err?.message || "Failed" });
  }
});
