import { HttpsError, onCall, onRequest } from "firebase-functions/v2/https";
import { FieldValue, Timestamp, getFirestore, getStorage } from "./firebase.js";
import { withCors } from "./middleware/cors.js";
import { requireAppCheckStrict, softAppCheck } from "./middleware/appCheck.js";
import { requireAuth } from "./http.js";
import { consumeOne, consumeCredit, addCredits } from "./credits.js";
import { enforceRateLimit } from "./middleware/rateLimit.js";
import { getScanProvider, getLeanLenseConfig } from "./appConfig.js";
const db = getFirestore();
const storage = getStorage();
function buildUploadPrefix(uid, scanId) {
    return `uploads/${uid}/${scanId}/raw/`;
}
function defaultMetrics(scanId) {
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
function clamp(value, min, max) {
    if (!Number.isFinite(value))
        return min;
    return Math.min(Math.max(value, min), max);
}
function buildSummary(metrics, usedFallback) {
    const rawBf = Number(metrics?.bodyFatPct ?? metrics?.bodyFat ?? metrics?.body_fat ?? 22.5);
    const bfPct = Number(clamp(rawBf, 3, 60).toFixed(1));
    const spread = usedFallback ? 2.5 : 1.8;
    const low = Number(clamp(bfPct - spread, 3, 60).toFixed(1));
    const high = Number(clamp(bfPct + spread, 3, 60).toFixed(1));
    const confidence = usedFallback ? "low" : "medium";
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
async function cleanupUploads(files) {
    await Promise.allSettled(files.map(async (path) => {
        if (!path)
            return;
        try {
            await storage.bucket().file(path).delete({ ignoreNotFound: true });
        }
        catch (error) {
            console.warn("scan_cleanup_error", { path, message: error?.message });
        }
    }));
}
async function isFounder(uid) {
    try {
        const snap = await db.doc(`users/${uid}`).get();
        if (!snap.exists)
            return false;
        return Boolean(snap.data()?.meta?.founder);
    }
    catch (error) {
        console.warn("scan_founder_lookup_error", { uid, message: error?.message });
        return false;
    }
}
function sanitizeFileList(uid, scanId, files) {
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
async function createScanSession(uid) {
    await enforceRateLimit({ uid, key: "scan_create", limit: 10, windowMs: 60 * 60 * 1000 });
    const ref = db.collection(`users/${uid}/scans`).doc();
    const now = Timestamp.now();
    const doc = {
        createdAt: now,
        updatedAt: now,
        status: "awaiting_upload",
        legacyStatus: "awaiting_upload",
        statusV1: "awaiting_upload",
        files: [],
        usedFallback: false,
    };
    await ref.set(doc);
    return {
        scanId: ref.id,
        uploadPathPrefix: buildUploadPrefix(uid, ref.id),
        status: "awaiting_upload",
    };
}
async function queueScan(uid, scanId, files) {
    const ref = db.doc(`users/${uid}/scans/${scanId}`);
    const snap = await ref.get();
    if (!snap.exists) {
        throw new HttpsError("not-found", "Scan not found");
    }
    await ref.set({
        files,
        fileCount: files.length,
        status: "queued",
        legacyStatus: "queued",
        statusV1: "queued",
        updatedAt: Timestamp.now(),
    }, { merge: true });
}
async function runScanProvider(uid, scanId, files) {
    const provider = getScanProvider();
    const fallback = defaultMetrics(scanId);
    if (provider === "mock") {
        return { metrics: fallback, usedFallback: false, provider: "mock", notes: ["mock_provider"] };
    }
    const { endpoint, secret } = getLeanLenseConfig();
    if (!endpoint || !secret) {
        return { metrics: fallback, usedFallback: true, provider: "leanlense", notes: ["leanlense_config_missing"] };
    }
    if (!files.length) {
        return { metrics: fallback, usedFallback: true, provider: "leanlense", notes: ["no_files"] };
    }
    try {
        const bucket = storage.bucket();
        const imagePath = `gs://${bucket.name}/${files[0]}`;
        const resp = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
            body: JSON.stringify({ image: imagePath, uid, scanId }),
        });
        if (!resp.ok)
            throw new Error(`leanlense_status_${resp.status}`);
        const data = await resp.json();
        const metrics = normalizeProviderMetrics(data) || fallback;
        return { metrics, usedFallback: false, provider: "leanlense", notes: ["leanlense_success"] };
    }
    catch (err) {
        console.error("runScanProvider", err);
        return { metrics: fallback, usedFallback: true, provider: "leanlense", notes: ["leanlense_error"] };
    }
}
function normalizeProviderMetrics(raw) {
    if (!raw)
        return null;
    if (Array.isArray(raw)) {
        const obj = raw.find((item) => typeof item === "object" && item !== null);
        if (obj)
            return normalizeProviderMetrics(obj);
    }
    const source = typeof raw === "object" ? raw : {};
    const bodyFat = source.body_fat ?? source.bodyFat ?? source.bodyFatPct ?? null;
    const leanMass = source.lean_mass ?? source.leanMass ?? null;
    const bmi = source.bmi ?? null;
    if (bodyFat == null && leanMass == null && bmi == null)
        return null;
    return {
        bodyFatPct: typeof bodyFat === "number" ? Number(bodyFat.toFixed(1)) : bodyFat,
        leanMassKg: typeof leanMass === "number" ? Number(leanMass.toFixed(1)) : leanMass,
        bmi: typeof bmi === "number" ? Number(bmi.toFixed(1)) : bmi,
        source: "replicate",
    };
}
async function completeScan(uid, scanId, result, summary) {
    const ref = db.doc(`users/${uid}/scans/${scanId}`);
    const now = Timestamp.now();
    await ref.set({
        status: "completed",
        legacyStatus: "done",
        statusV1: "done",
        statusLabels: FieldValue.arrayUnion("completed", "done"),
        completedAt: now,
        updatedAt: now,
        metrics: result.metrics,
        usedFallback: result.usedFallback,
        provider: result.provider || (result.usedFallback ? "fallback" : getScanProvider()),
        notes: result.notes || [],
        result: summary,
    }, { merge: true });
}
async function handleProcess(uid, scanId, overrideFiles) {
    const ref = db.doc(`users/${uid}/scans/${scanId}`);
    const snap = await ref.get();
    if (!snap.exists) {
        throw new HttpsError("not-found", "Scan not found");
    }
    const data = snap.data();
    const files = overrideFiles ?? (Array.isArray(data.files) ? data.files : []);
    if (files.length !== 4) {
        throw new HttpsError("invalid-argument", "expected_four_images");
    }
    await ref.set({ status: "processing", updatedAt: Timestamp.now(), files, fileCount: files.length }, { merge: true });
    const result = await runScanProvider(uid, scanId, files);
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
function respond(res, body, status = 200) {
    res.status(status).json(body);
}
async function handleStartRequest(req, res) {
    await requireAppCheckStrict(req, res);
    const uid = await requireAuth(req);
    const session = await createScanSession(uid);
    respond(res, session);
}
export async function startScanHandler(_data, context) {
    const uid = context.auth?.uid;
    if (!uid) {
        throw new HttpsError("unauthenticated", "Login required");
    }
    const session = await createScanSession(uid);
    return { scanId: session.scanId, uploadPathPrefix: session.uploadPathPrefix };
}
export async function runBodyScanHandler(_data, context) {
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
export const startScan = onCall({ region: "us-central1" }, async (request) => startScanHandler(request.data, request));
export const runBodyScan = onCall({ region: "us-central1" }, async (request) => runBodyScanHandler(request.data, request));
export const startScanSession = onRequest({ invoker: "public", concurrency: 15 }, withCors(async (req, res) => {
    try {
        await handleStartRequest(req, res);
    }
    catch (err) {
        if (res.headersSent) {
            return;
        }
        respond(res, { error: err.message || "error" }, err.code === "unauthenticated" ? 401 : 500);
    }
}));
export const submitScan = onRequest({ invoker: "public", concurrency: 15 }, withCors(async (req, res) => {
    try {
        await requireAppCheckStrict(req, res);
        const uid = await requireAuth(req);
        const body = req.body;
        if (!body?.scanId) {
            throw new HttpsError("invalid-argument", "scanId required");
        }
        const files = sanitizeFileList(uid, body.scanId, body.files);
        const founder = await isFounder(uid);
        let creditRemaining = null;
        let creditConsumed = false;
        if (!founder) {
            const creditResult = await consumeCredit(uid);
            if (!creditResult.consumed) {
                throw new HttpsError("failed-precondition", "no_credits");
            }
            creditConsumed = true;
            creditRemaining = creditResult.remaining;
        }
        await queueScan(uid, body.scanId, files);
        let result;
        try {
            result = await handleProcess(uid, body.scanId, files);
        }
        catch (error) {
            if (creditConsumed) {
                await addCredits(uid, 1, "Scan auto-refund", 12).catch(() => undefined);
            }
            throw error;
        }
        finally {
            await cleanupUploads(files);
        }
        respond(res, { ...result, creditsRemaining: creditRemaining });
    }
    catch (err) {
        if (res.headersSent) {
            return;
        }
        const code = err instanceof HttpsError ? err.code : "internal";
        const status = code === "unauthenticated"
            ? 401
            : code === "invalid-argument"
                ? 400
                : code === "failed-precondition"
                    ? 402
                    : 500;
        respond(res, { error: err.message || "error" }, status);
    }
}));
export const processQueuedScanHttp = onRequest({ invoker: "public", concurrency: 10 }, withCors(async (req, res) => {
    try {
        await requireAppCheckStrict(req, res);
        const uid = await requireAuth(req);
        const scanId = req.body?.scanId || req.query?.scanId;
        if (!scanId) {
            throw new HttpsError("invalid-argument", "scanId required");
        }
        const result = await handleProcess(uid, scanId);
        respond(res, result);
    }
    catch (err) {
        if (res.headersSent) {
            return;
        }
        const code = err instanceof HttpsError ? err.code : "internal";
        const status = code === "unauthenticated"
            ? 401
            : code === "invalid-argument"
                ? 400
                : code === "not-found"
                    ? 404
                    : 500;
        respond(res, { error: err.message || "error" }, status);
    }
}));
export const processScan = onRequest({ invoker: "public", concurrency: 10 }, async (req, res) => {
    await processQueuedScanHttp(req, res);
});
export const getScanStatus = onRequest({ invoker: "public", concurrency: 20 }, withCors(async (req, res) => {
    try {
        await softAppCheck(req);
        const uid = await requireAuth(req);
        const scanId = req.query?.scanId || req.body?.scanId;
        if (!scanId) {
            throw new HttpsError("invalid-argument", "scanId required");
        }
        const snap = await db.doc(`users/${uid}/scans/${scanId}`).get();
        if (!snap.exists) {
            throw new HttpsError("not-found", "Scan not found");
        }
        const data = snap.data();
        const payload = { id: snap.id, ...data };
        if (data.status === "completed") {
            payload.pipelineStatus = "completed";
            payload.status = "done";
        }
        respond(res, payload);
    }
    catch (err) {
        if (res.headersSent) {
            return;
        }
        const code = err instanceof HttpsError ? err.code : "internal";
        const status = code === "unauthenticated"
            ? 401
            : code === "invalid-argument"
                ? 400
                : code === "not-found"
                    ? 404
                    : 500;
        respond(res, { error: err.message || "error" }, status);
    }
}));
//# sourceMappingURL=scan.js.map