import { HttpsError, onCall, onRequest } from "firebase-functions/v2/https";
import type { Request } from "firebase-functions/v2/https";
import { FieldValue, Timestamp, getFirestore, getStorage } from "./firebase.js";
import { softVerifyAppCheck } from "./middleware/appCheck.js";
import { withCors } from "./middleware/cors.js";
import { requireAuth, verifyAppCheckSoft } from "./http.js";
import type { ScanDocument } from "./types.js";

const db = getFirestore();
const storage = getStorage();

function buildUploadPrefix(uid: string, scanId: string) {
  return `uploads/${uid}/${scanId}/raw/`;
}

function defaultMetrics(scanId: string) {
  const seed = scanId.charCodeAt(0) || 42;
  const bodyFat = Number((18.5 + (seed % 10) * 0.7).toFixed(1));
  const leanMass = Number((58 + (seed % 5) * 1.3).toFixed(1));
  const bmi = Number((23 + (seed % 4) * 0.4).toFixed(1));
  return {
    bodyFatPct: bodyFat,
    leanMassKg: leanMass,
    bmi,
  };
}

async function createScanSession(uid: string) {
  const ref = db.collection(`users/${uid}/scans`).doc();
  const now = Timestamp.now();
  const doc: ScanDocument = {
    createdAt: now,
    updatedAt: now,
    status: "awaiting_upload",
    legacyStatus: "awaiting_upload",
    statusV1: "awaiting_upload",
    files: [],
    mock: false,
  };
  await ref.set(doc);
  return {
    scanId: ref.id,
    uploadPathPrefix: buildUploadPrefix(uid, ref.id),
    status: "awaiting_upload",
  };
}

async function queueScan(uid: string, scanId: string, files: string[]) {
  const ref = db.doc(`users/${uid}/scans/${scanId}`);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new HttpsError("not-found", "Scan not found");
  }
  await ref.set(
    {
      files,
      fileCount: files.length,
      status: "queued",
      legacyStatus: "queued",
      statusV1: "queued",
      updatedAt: Timestamp.now(),
    },
    { merge: true }
  );
}

interface ProviderResult {
  metrics: Record<string, any>;
  usedMock: boolean;
  provider?: string;
  notes?: string[];
}

async function runScanProvider(uid: string, scanId: string, files: string[]): Promise<ProviderResult> {
  const fallback = defaultMetrics(scanId);
  const replicateKey = process.env.REPLICATE_API_KEY;
  if (!replicateKey) {
    return { metrics: fallback, usedMock: true, notes: ["replicate_key_missing"] };
  }
  if (!files.length) {
    return { metrics: fallback, usedMock: true, notes: ["no_files"] };
  }
  try {
    const bucket = storage.bucket();
    const imagePath = `gs://${bucket.name}/${files[0]}`;
    const version = process.env.REPLICATE_MODEL || "cjwbw/ultralytics-pose:9d045f";
    const createResp = await fetch("https://api.replicate.com/v1/predictions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${replicateKey}`,
      },
      body: JSON.stringify({
        version,
        input: { image: imagePath },
      }),
    });
    if (!createResp.ok) {
      throw new Error(`replicate create failed: ${createResp.status}`);
    }
    let prediction: any = await createResp.json();
    let status = prediction?.status;
    let attempts = 0;
    while (status && ["starting", "processing"].includes(status) && attempts < 10) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      if (!prediction?.urls?.get) break;
      const poll = await fetch(prediction.urls.get, {
        headers: { Authorization: `Bearer ${replicateKey}` },
      });
      if (!poll.ok) break;
      prediction = await poll.json();
      status = prediction?.status;
      attempts += 1;
    }
    if (status !== "succeeded") {
      throw new Error(`replicate status ${status || "unknown"}`);
    }
    const raw = prediction?.output || prediction?.results || prediction;
    const metrics = normalizeProviderMetrics(raw) || fallback;
    return { metrics, usedMock: false, provider: "replicate", notes: ["replicate_success"] };
  } catch (err) {
    console.error("runScanProvider", err);
    return { metrics: fallback, usedMock: true, notes: ["replicate_error"] };
  }
}

function normalizeProviderMetrics(raw: any): Record<string, any> | null {
  if (!raw) return null;
  if (Array.isArray(raw)) {
    const obj = raw.find((item) => typeof item === "object" && item !== null);
    if (obj) return normalizeProviderMetrics(obj);
  }
  const source = typeof raw === "object" ? raw : {};
  const bodyFat = source.body_fat ?? source.bodyFat ?? source.bodyFatPct ?? null;
  const leanMass = source.lean_mass ?? source.leanMass ?? null;
  const bmi = source.bmi ?? null;
  if (bodyFat == null && leanMass == null && bmi == null) return null;
  return {
    bodyFatPct: typeof bodyFat === "number" ? Number(bodyFat.toFixed(1)) : bodyFat,
    leanMassKg: typeof leanMass === "number" ? Number(leanMass.toFixed(1)) : leanMass,
    bmi: typeof bmi === "number" ? Number(bmi.toFixed(1)) : bmi,
    source: "replicate",
  };
}

async function completeScan(uid: string, scanId: string, result: ProviderResult) {
  const ref = db.doc(`users/${uid}/scans/${scanId}`);
  const now = Timestamp.now();
  await ref.set(
    {
      status: "completed",
      legacyStatus: "done",
      statusV1: "done",
      statusLabels: FieldValue.arrayUnion("completed", "done"),
      completedAt: now,
      updatedAt: now,
      metrics: result.metrics,
      mock: result.usedMock,
      provider: result.provider || (result.usedMock ? "mock" : "replicate"),
      notes: result.notes || [],
    },
    { merge: true }
  );
}

async function handleProcess(uid: string, scanId: string) {
  const ref = db.doc(`users/${uid}/scans/${scanId}`);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new HttpsError("not-found", "Scan not found");
  }
  const data = snap.data() as Partial<ScanDocument>;
  const files = Array.isArray(data.files) ? data.files : [];
  await ref.set({ status: "processing", updatedAt: Timestamp.now() }, { merge: true });
  const result = await runScanProvider(uid, scanId, files);
  await completeScan(uid, scanId, result);
  return {
    scanId,
    status: "done",
    pipelineStatus: "completed",
    metrics: result.metrics,
    mock: result.usedMock,
  };
}

function respond(res: any, body: any, status = 200) {
  res.status(status).json(body);
}

async function handleStartRequest(req: Request, res: any) {
  await verifyAppCheckSoft(req);
  const uid = await requireAuth(req);
  const session = await createScanSession(uid);
  respond(res, session);
}

export const startScan = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Login required");
  }
  const uid = request.auth.uid;
  const session = await createScanSession(uid);
  return { scanId: session.scanId, uploadPathPrefix: session.uploadPathPrefix };
});

export const runBodyScan = onRequest(
  withCors(async (req, res) => {
    try {
      await softVerifyAppCheck(req as any, res as any);
      await handleStartRequest(req, res);
    } catch (err: any) {
      respond(res, { error: err.message || "error" }, err.code === "unauthenticated" ? 401 : 500);
    }
  })
);

export const startScanSession = onRequest(
  withCors(async (req, res) => {
    try {
      await softVerifyAppCheck(req as any, res as any);
      await handleStartRequest(req, res);
    } catch (err: any) {
      respond(res, { error: err.message || "error" }, err.code === "unauthenticated" ? 401 : 500);
    }
  })
);

export const submitScan = onRequest(
  withCors(async (req, res) => {
    try {
      await softVerifyAppCheck(req as any, res as any);
      await verifyAppCheckSoft(req);
      const uid = await requireAuth(req);
      const body = req.body as { scanId?: string; files?: string[] };
      if (!body?.scanId || !Array.isArray(body.files)) {
        throw new HttpsError("invalid-argument", "scanId and files required");
      }
      await queueScan(uid, body.scanId, body.files);
      respond(res, { scanId: body.scanId, status: "queued" });
    } catch (err: any) {
      const code = err instanceof HttpsError ? err.code : "internal";
      const status = code === "unauthenticated" ? 401 : code === "invalid-argument" ? 400 : 500;
      respond(res, { error: err.message || "error" }, status);
    }
  })
);

export const processQueuedScanHttp = onRequest(
  withCors(async (req, res) => {
    try {
      await softVerifyAppCheck(req as any, res as any);
      await verifyAppCheckSoft(req);
      const uid = await requireAuth(req);
      const scanId = (req.body?.scanId as string) || (req.query?.scanId as string);
      if (!scanId) {
        throw new HttpsError("invalid-argument", "scanId required");
      }
      const result = await handleProcess(uid, scanId);
      respond(res, result);
    } catch (err: any) {
      const code = err instanceof HttpsError ? err.code : "internal";
      const status =
        code === "unauthenticated"
          ? 401
          : code === "invalid-argument"
          ? 400
          : code === "not-found"
          ? 404
          : 500;
      respond(res, { error: err.message || "error" }, status);
    }
  })
);

export const processScan = onRequest(async (req, res) => {
  await processQueuedScanHttp(req, res);
});

export const getScanStatus = onRequest(
  withCors(async (req, res) => {
    try {
      await softVerifyAppCheck(req as any, res as any);
      await verifyAppCheckSoft(req);
      const uid = await requireAuth(req);
      const scanId = (req.query?.scanId as string) || (req.body?.scanId as string);
      if (!scanId) {
        throw new HttpsError("invalid-argument", "scanId required");
      }
      const snap = await db.doc(`users/${uid}/scans/${scanId}`).get();
      if (!snap.exists) {
        throw new HttpsError("not-found", "Scan not found");
      }
      const data = snap.data() as Partial<ScanDocument>;
      const payload: any = { id: snap.id, ...data };
      if (data.status === "completed") {
        payload.pipelineStatus = "completed";
        payload.status = "done";
      }
      respond(res, payload);
    } catch (err: any) {
      const code = err instanceof HttpsError ? err.code : "internal";
      const status =
        code === "unauthenticated"
          ? 401
          : code === "invalid-argument"
          ? 400
          : code === "not-found"
          ? 404
          : 500;
      respond(res, { error: err.message || "error" }, status);
    }
  })
);
