import { HttpsError, onCall, onRequest } from "firebase-functions/v2/https";
import type { CallableRequest } from "firebase-functions/v2/https";
import type { Request as ExpressRequest, Response as ExpressResponse } from "express";
import { FieldValue, Timestamp, getFirestore, getStorage } from "./firebase.js";
import { withCors } from "./middleware/cors.js";
import { requireAppCheckStrict, softAppCheck } from "./middleware/appCheck.js";
import { requireAuth } from "./http.js";
import type { ScanDocument } from "./types.js";
import { consumeOne, consumeCredit, addCredits } from "./credits.js";
import { enforceRateLimit } from "./middleware/rateLimit.js";

const db = getFirestore();
const storage = getStorage();

type ScanCallableContext = Pick<CallableRequest<unknown>, "auth">;

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

function defaultWeight(scanId: string) {
  const seed = scanId.charCodeAt(scanId.length - 1) || scanId.charCodeAt(0) || 42;
  return Number((70 + (seed % 25) * 0.8).toFixed(1));
}

type ScanSummary = {
  bfPct: number;
  range: { low: number; high: number };
  confidence: "low" | "medium" | "high";
  notes: string[];
};

interface StartScanPayload {
  idempotencyKey?: string | null;
}

function parseStartPayload(data: unknown): StartScanPayload {
  if (!data || typeof data !== "object") return {};
  const keyRaw = (data as any)?.idempotencyKey;
  if (typeof keyRaw !== "string") return {};
  const trimmed = keyRaw.trim();
  if (!trimmed) return {};
  return { idempotencyKey: trimmed.slice(0, 128) };
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

function buildSummary(metrics: Record<string, any>, usedFallback: boolean): ScanSummary {
  const rawBf = Number(metrics?.bodyFatPct ?? metrics?.bodyFat ?? metrics?.body_fat ?? 22.5);
  const bfPct = Number(clamp(rawBf, 3, 60).toFixed(1));
  const spread = usedFallback ? 2.5 : 1.8;
  const low = Number(clamp(bfPct - spread, 3, 60).toFixed(1));
  const high = Number(clamp(bfPct + spread, 3, 60).toFixed(1));
  const confidence: ScanSummary["confidence"] = usedFallback ? "low" : "medium";
  const notes = [
    usedFallback
      ? "Fallback estimate generated because the primary model was unavailable."
      : "Vision model estimate based on your uploaded photos.",
    "Educational use only. Estimates only — not medical advice.",
  ];
  return {
    bfPct,
    range: { low, high },
    confidence,
    notes,
  };
}

async function cleanupUploads(files: string[]): Promise<void> {
  await Promise.allSettled(
    files.map(async (path) => {
      if (!path) return;
      try {
        await storage.bucket().file(path).delete({ ignoreNotFound: true });
      } catch (error) {
        console.warn("scan_cleanup_error", { path, message: (error as any)?.message });
      }
    })
  );
}

async function isFounder(uid: string): Promise<boolean> {
  try {
    const snap = await db.doc(`users/${uid}`).get();
    if (!snap.exists) return false;
    return Boolean((snap.data() as any)?.meta?.founder);
  } catch (error) {
    console.warn("scan_founder_lookup_error", { uid, message: (error as any)?.message });
    return false;
  }
}

async function findScanByIdempotency(uid: string, key: string) {
  if (!key) return null;
  try {
    const snapshot = await db
      .collection(`users/${uid}/scans`)
      .where("idempotencyKey", "==", key)
      .limit(1)
      .get();
    if (snapshot.empty) return null;
    const doc = snapshot.docs[0];
    return { id: doc.id, data: doc.data() as Partial<ScanDocument> };
  } catch (error) {
    console.warn("scan_idempotency_lookup_error", { uid, key, message: (error as any)?.message });
    return null;
  }
}

async function reserveScanCredit(uid: string): Promise<number> {
  const result = await consumeCredit(uid);
  if (!result.consumed) {
    throw new HttpsError("failed-precondition", "no_credits");
  }
  console.info("scan_credit_reserved", { uid, remaining: result.remaining });
  return result.remaining;
}

function sanitizeFileList(uid: string, scanId: string, files: unknown): string[] {
  if (!Array.isArray(files)) {
    throw new HttpsError("invalid-argument", "files_required");
  }
  const sanitized = files
    .map((file) => (typeof file === "string" ? file.trim() : ""))
    .filter(Boolean);
  if (sanitized.length !== 4) {
    throw new HttpsError("invalid-argument", "exactly_four_files_required");
  }
  sanitized.forEach((path) => {
    if (!path.startsWith(`uploads/${uid}/${scanId}/`)) {
      throw new HttpsError("invalid-argument", "invalid_upload_path");
    }
  });
  return sanitized;
}

interface CreateScanOptions {
  idempotencyKey?: string | null;
  creditReserved?: boolean;
  creditsRemaining?: number | null;
}

async function createScanSession(uid: string, options: CreateScanOptions = {}) {
  await enforceRateLimit({ uid, key: "scan_create", limit: 10, windowMs: 60 * 60 * 1000 });
  const ref = db.collection(`users/${uid}/scans`).doc();
  const now = Timestamp.now();
  const doc: ScanDocument = {
    createdAt: now,
    updatedAt: now,
    status: "queued",
    legacyStatus: "queued",
    statusV1: "queued",
    files: [],
    usedFallback: false,
    idempotencyKey: options.idempotencyKey ?? null,
    creditReserved: Boolean(options.creditReserved),
    creditsRemaining: options.creditsRemaining ?? null,
  };
  await ref.set({ ...doc, statusLabels: ["queued"] });
  return {
    scanId: ref.id,
    uploadPathPrefix: buildUploadPrefix(uid, ref.id),
    status: "queued" as const,
    creditsRemaining: options.creditsRemaining ?? null,
    idempotencyKey: options.idempotencyKey ?? null,
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
      status: "awaiting_processing",
      legacyStatus: "awaiting_processing",
      statusV1: "awaiting_processing",
      updatedAt: Timestamp.now(),
      statusLabels: FieldValue.arrayUnion("awaiting_processing"),
    },
    { merge: true }
  );
}

interface ProviderResult {
  metrics: Record<string, any>;
  usedFallback: boolean;
  provider?: string;
  notes?: string[];
}

async function generateSignedUrls(files: string[]): Promise<string[]> {
  const bucket = storage.bucket();
  const expires = new Date(Date.now() + 60 * 60 * 1000);
  const urls = await Promise.all(
    files.map(async (path) => {
      const file = bucket.file(path);
      const [url] = await file.getSignedUrl({
        action: "read",
        expires,
        version: "v4",
      });
      return url;
    })
  );
  return urls;
}

function runMockScan(scanId: string): ProviderResult {
  const fallback = defaultMetrics(scanId);
  const weightKg = defaultWeight(scanId);
  return {
    metrics: {
      bodyFatPct: fallback.bodyFatPct,
      leanMassKg: fallback.leanMassKg,
      BMI: Number(fallback.bmi.toFixed(1)),
      bmi: fallback.bmi,
      weightKg,
      source: "mock",
    },
    usedFallback: true,
    provider: "mock",
    notes: ["mock_result"],
  };
}

async function runOpenAIVisionScan(signedImageUrls: string[]): Promise<ProviderResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return runMockScan("openai_missing_key");
  }

  const model = process.env.OPENAI_VISION_MODEL || "gpt-4o-mini";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Estimate body fat %, weight (kg), and BMI for this person based on the photos. Return JSON with keys: bfPercent, weightKg, BMI.",
            },
            ...signedImageUrls.map((url) => ({ type: "image_url", image_url: url })),
          ],
        },
      ],
      response_format: { type: "json_object" },
    }),
    signal: controller.signal,
  });
  clearTimeout(timeout);

  if (!response.ok) {
    throw new Error(`openai_status_${response.status}`);
  }

  const payload = await response.json();
  const choice = payload?.choices?.[0];
  const messageContent = choice?.message?.content;
  let text: string | null = null;
  if (typeof messageContent === "string") {
    text = messageContent;
  } else if (Array.isArray(messageContent)) {
    const textPart = messageContent.find((part: any) => typeof part === "string" || typeof part?.text === "string");
    if (typeof textPart === "string") {
      text = textPart;
    } else if (textPart && typeof textPart.text === "string") {
      text = textPart.text;
    }
  } else if (choice?.message?.tool_calls?.length) {
    text = choice.message.tool_calls[0]?.function?.arguments ?? null;
  }

  if (!text) {
    throw new Error("openai_empty_response");
  }

  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error("openai_invalid_json");
  }

  const rawBf = Number(parsed?.bfPercent ?? parsed?.bodyFatPct ?? parsed?.bodyFat);
  const rawWeight = Number(parsed?.weightKg ?? parsed?.weight_kg ?? parsed?.weight);
  const rawBmi = Number(parsed?.BMI ?? parsed?.bmi ?? parsed?.bodyMassIndex);

  const bodyFatPct = Number(clamp(rawBf, 3, 70).toFixed(1));
  const weightKg = Number.isFinite(rawWeight) ? Number(rawWeight.toFixed(1)) : undefined;
  const BMI = Number.isFinite(rawBmi) ? Number(rawBmi.toFixed(1)) : undefined;

  const metrics: Record<string, any> = {
    bodyFatPct,
  };
  if (typeof weightKg === "number" && Number.isFinite(weightKg)) {
    metrics.weightKg = weightKg;
  }
  if (typeof BMI === "number" && Number.isFinite(BMI)) {
    metrics.BMI = BMI;
  }

  return {
    metrics,
    usedFallback: false,
    provider: "openai-vision",
    notes: ["openai_vision_success"],
  };
}

async function selectScanProvider(
  scanId: string,
  signedUrls: string[],
  preference: "openai" | "mock"
): Promise<ProviderResult> {
  if (preference === "openai") {
    try {
      return await runOpenAIVisionScan(signedUrls);
    } catch (error) {
      console.error("openai_scan_error", {
        scanId,
        message: (error as any)?.message,
      });
    }
  }
  return runMockScan(scanId);
}

async function completeScan(uid: string, scanId: string, result: ProviderResult, summary: ScanSummary) {
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
      usedFallback: result.usedFallback,
      provider: result.provider || (result.usedFallback ? "mock" : "openai-vision"),
      notes: result.notes || [],
      result: summary,
    },
    { merge: true }
  );
}

interface HandleProcessOptions {
  overrideFiles?: string[];
  provider?: "openai" | "mock";
}

async function handleProcess(uid: string, scanId: string, options: HandleProcessOptions = {}) {
  const ref = db.doc(`users/${uid}/scans/${scanId}`);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new HttpsError("not-found", "Scan not found");
  }
  const data = snap.data() as Partial<ScanDocument>;
  const files = options.overrideFiles ?? (Array.isArray(data.files) ? data.files : []);
  if (files.length !== 4) {
    throw new HttpsError("invalid-argument", "expected_four_images");
  }
  await ref.set(
    {
      status: "processing",
      updatedAt: Timestamp.now(),
      files,
      fileCount: files.length,
      statusLabels: FieldValue.arrayUnion("processing"),
    },
    { merge: true }
  );
  const signedUrls = await generateSignedUrls(files);
  const fallback = defaultMetrics(scanId);
  const fallbackMetrics = {
    bodyFatPct: fallback.bodyFatPct,
    leanMassKg: fallback.leanMassKg,
    BMI: Number(fallback.bmi.toFixed(1)),
    bmi: fallback.bmi,
    weightKg: defaultWeight(scanId),
  };
  const providerPreference = options.provider ?? (process.env.OPENAI_API_KEY ? "openai" : "mock");
  const rawResult = await selectScanProvider(scanId, signedUrls, providerPreference);
  const mergedMetrics = { ...fallbackMetrics, ...rawResult.metrics };
  const result: ProviderResult = {
    metrics: mergedMetrics,
    usedFallback: rawResult.usedFallback,
    provider: rawResult.provider,
    notes: rawResult.notes,
  };
  const summary = buildSummary(result.metrics, result.usedFallback);
  await completeScan(uid, scanId, result, summary);
  return {
    scanId,
    status: "done",
    pipelineStatus: "completed",
    metrics: result.metrics,
    usedFallback: result.usedFallback,
    result: summary,
  };
}

function respond(res: any, body: any, status = 200) {
  res.status(status).json(body);
}

async function handleStartRequest(req: ExpressRequest, res: ExpressResponse) {
  await requireAppCheckStrict(req, res);
  const uid = await requireAuth(req);
  const context = { auth: { uid } } as ScanCallableContext;
  const session = await startScanHandler(req.body, context);
  respond(res, session);
}

export async function startScanHandler(
  data: unknown,
  context: ScanCallableContext
) {
  const uid = context.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Login required");
  }
  const payload = parseStartPayload(data);
  const idempotencyKey = payload.idempotencyKey ?? null;

  if (idempotencyKey) {
    const existing = await findScanByIdempotency(uid, idempotencyKey);
    if (existing) {
      return {
        scanId: existing.id,
        uploadPathPrefix: buildUploadPrefix(uid, existing.id),
        status: existing.data.status ?? "queued",
        creditsRemaining:
          typeof existing.data.creditsRemaining === "number" ? existing.data.creditsRemaining : null,
        idempotencyKey,
      };
    }
  }

  const founder = await isFounder(uid);
  let creditsRemaining: number | null = null;
  let creditReserved = false;

  if (!founder) {
    creditsRemaining = await reserveScanCredit(uid);
    creditReserved = true;
  }

  const session = await createScanSession(uid, {
    idempotencyKey,
    creditReserved,
    creditsRemaining,
  });

  return {
    scanId: session.scanId,
    uploadPathPrefix: session.uploadPathPrefix,
    status: session.status,
    creditsRemaining: session.creditsRemaining ?? creditsRemaining,
    idempotencyKey,
  };
}

export async function runBodyScanHandler(
  _data: unknown,
  context: ScanCallableContext
) {
  const uid = context.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Login required");
  }
  const ok = await consumeOne(uid);
  if (!ok) {
    throw new HttpsError("failed-precondition", "No scan credits available.");
  }
  return createScanSession(uid);
}

export const startScan = onCall(
  { region: "us-central1" },
  async (request: CallableRequest<unknown>) => startScanHandler(request.data, request)
);

export const runBodyScan = onCall(
  { region: "us-central1" },
  async (request: CallableRequest<unknown>) => runBodyScanHandler(request.data, request)
);

export const startScanSession = onRequest(
  { invoker: "public", concurrency: 15 },
  withCors(async (req, res) => {
    try {
      await handleStartRequest(req as ExpressRequest, res as ExpressResponse);
    } catch (err: any) {
      if (res.headersSent) {
        return;
      }
      respond(res, { error: err.message || "error" }, err.code === "unauthenticated" ? 401 : 500);
    }
  })
);

export const submitScan = onRequest(
  { invoker: "public", concurrency: 15 },
  withCors(async (req, res) => {
    try {
      await requireAppCheckStrict(req as ExpressRequest, res as ExpressResponse);
      const uid = await requireAuth(req);
      const body = req.body as { scanId?: string; files?: unknown };
      if (!body?.scanId) {
        throw new HttpsError("invalid-argument", "scanId required");
      }

      const ref = db.doc(`users/${uid}/scans/${body.scanId}`);
      const files = sanitizeFileList(uid, body.scanId, body.files);
      const founder = await isFounder(uid);
      let creditRemaining: number | null = null;
      let creditConsumed = false;

      const existing = await ref.get();
      const existingData = existing.exists ? (existing.data() as Partial<ScanDocument>) : null;
      if (existingData?.creditReserved) {
        creditRemaining =
          typeof existingData.creditsRemaining === "number" ? existingData.creditsRemaining : null;
      }

      if (!founder && !existingData?.creditReserved) {
        const creditResult = await consumeCredit(uid);
        if (!creditResult.consumed) {
          throw new HttpsError("failed-precondition", "no_credits");
        }
        creditConsumed = true;
        creditRemaining = creditResult.remaining;
        await ref.set(
          {
            creditReserved: true,
            creditsRemaining: creditRemaining,
            statusLabels: FieldValue.arrayUnion("credit_reserved"),
          },
          { merge: true }
        );
      }

      await queueScan(uid, body.scanId, files);

      let result: Awaited<ReturnType<typeof handleProcess>>;
      try {
        result = await handleProcess(uid, body.scanId, {
          overrideFiles: files,
          provider: process.env.OPENAI_API_KEY ? "openai" : "mock",
        });
      } catch (error) {
        if (creditConsumed) {
          await addCredits(uid, 1, "Scan auto-refund", 12).catch(() => undefined);
        }
        throw error;
      } finally {
        await cleanupUploads(files);
      }

      respond(res, { ...result, creditsRemaining: creditRemaining });
    } catch (err: any) {
      if (res.headersSent) {
        return;
      }
      const code = err instanceof HttpsError ? err.code : "internal";
      const status =
        code === "unauthenticated"
          ? 401
          : code === "invalid-argument"
          ? 400
          : code === "failed-precondition"
          ? 402
          : 500;
      respond(res, { error: err.message || "error" }, status);
    }
  })
);

export const processQueuedScanHttp = onRequest(
  { invoker: "public", concurrency: 10 },
  withCors(async (req, res) => {
    try {
      await requireAppCheckStrict(req as ExpressRequest, res as ExpressResponse);
      const uid = await requireAuth(req);
      const scanId = (req.body?.scanId as string) || (req.query?.scanId as string);
      if (!scanId) {
        throw new HttpsError("invalid-argument", "scanId required");
      }
      const result = await handleProcess(uid, scanId, {
        provider: process.env.OPENAI_API_KEY ? "openai" : "mock",
      });
      respond(res, result);
    } catch (err: any) {
      if (res.headersSent) {
        return;
      }
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

export const processScan = onRequest({ invoker: "public", concurrency: 10 }, async (req, res) => {
  await processQueuedScanHttp(req, res);
});

export const getScanStatus = onRequest(
  { invoker: "public", concurrency: 20 },
  withCors(async (req, res) => {
    try {
      await softAppCheck(req as ExpressRequest);
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
      if (res.headersSent) {
        return;
      }
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
