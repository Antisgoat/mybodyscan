import { HttpsError, onRequest } from "firebase-functions/v2/https";
import type { Request as ExpressRequest, Response as ExpressResponse } from "express";
import { FieldValue, Timestamp, getFirestore } from "../firebase.js";
import { withCors } from "../middleware/cors.js";
import { requireAppCheckStrict } from "../middleware/appCheck.js";
import { requireAuth } from "../http.js";
import { consumeCreditBuckets } from "./creditUtils.js";
import { enforceRateLimit } from "../middleware/rateLimit.js";
import { validateBeginPaidScanPayload } from "../validation/beginPaidScan.js";

const db = getFirestore();
const MAX_DAILY_FAILS = 3;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function todayKey() {
  const now = new Date();
  return `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(now.getUTCDate()).padStart(2, "0")}`;
}

async function handler(req: ExpressRequest, res: ExpressResponse) {
  await requireAppCheckStrict(req, res);
  const uid = await requireAuth(req);
  const validation = validateBeginPaidScanPayload(req.body);
  if (!validation.success) {
    console.warn("beginPaidScan_invalid_payload", { uid, errors: validation.errors });
    res.status(400).json({ ok: false, reason: "invalid_request", errors: validation.errors });
    return;
  }
  const payload = validation.data;

  try {
    await enforceRateLimit({ uid, key: "beginPaidScan", limit: 10, windowMs: 60 * 60 * 1000 });
  } catch (err) {
    console.warn("beginPaidScan_rate_limited", { uid });
    res.status(429).json({ ok: false, reason: "rate_limited" });
    return;
  }

  const gateRef = db.doc(`users/${uid}/gate/${todayKey()}`);
  const gateSnap = await gateRef.get();
  const gateData = gateSnap.exists ? gateSnap.data() as any : {};
  const failedCount = Number(gateData.failed || 0);
  if (failedCount >= MAX_DAILY_FAILS) {
    res.status(429).json({ ok: false, reason: "cap" });
    return;
  }

  const cutoff = Timestamp.fromMillis(Date.now() - THIRTY_DAYS_MS);
  const recentQuery = await db
    .collection(`users/${uid}/scans`)
    .where("charged", "==", true)
    .where("status", "==", "completed")
    .where("completedAt", ">=", cutoff)
    .get();

  for (const docSnap of recentQuery.docs) {
    const data = docSnap.data() as any;
    const docHashes: string[] = Array.isArray(data.imageHashes) ? data.imageHashes : [];
    if (!docHashes.length) continue;
    const duplicate = payload.hashes.some((hash) => docHashes.includes(hash));
    if (duplicate) {
      res.status(409).json({ ok: false, reason: "duplicate" });
      return;
    }
  }

  const scanRef = db.doc(`users/${uid}/scans/${payload.scanId}`);
  const creditRef = db.doc(`users/${uid}/private/credits`);
  const now = Timestamp.now();
  let remainingCredits = 0;

  try {
    await db.runTransaction(async (tx) => {
      const scanSnap = await tx.get(scanRef);
      if (!scanSnap.exists) {
        throw new HttpsError("not-found", "scan_not_found");
      }

      const { buckets, consumed, total } = await consumeCreditBuckets(tx, creditRef, 1);
      if (!consumed) {
        throw new HttpsError("failed-precondition", "no_credits");
      }
      remainingCredits = total;

      tx.set(
        creditRef,
        {
          creditBuckets: buckets,
          creditsSummary: { totalAvailable: total, lastUpdated: now },
        },
        { merge: true }
      );

      tx.set(
        scanRef,
        {
          status: "authorized",
          charged: true,
          authorizedAt: now,
          updatedAt: now,
          gateScore: payload.gateScore,
          mode: payload.mode,
          imageHashes: payload.hashes,
          gate: { clientScore: payload.gateScore, authorizedAt: now },
        },
        { merge: true }
      );
    });
  } catch (error: any) {
    if (error instanceof HttpsError) {
      if (error.code === "failed-precondition") {
        res.status(402).json({ ok: false, reason: "no_credits" });
        return;
      }
      if (error.code === "not-found") {
        res.status(404).json({ ok: false, reason: "missing_scan" });
        return;
      }
    }
    res.status(500).json({ ok: false, reason: "server_error" });
    return;
  }

  await gateRef.set(
    {
      failed: failedCount,
      passed: FieldValue.increment(1),
      updatedAt: now,
    },
    { merge: true }
  );

  res.json({ ok: true, remainingCredits });
}

export const beginPaidScan = onRequest(
  { invoker: "public", concurrency: 10 },
  withCors(async (req, res) => {
    try {
      await handler(req as ExpressRequest, res as ExpressResponse);
    } catch (error: any) {
      if (res.headersSent) {
        return;
      }
      if (error instanceof HttpsError) {
        const status = error.code === "unauthenticated" ? 401 : 400;
        res.status(status).json({ ok: false, reason: error.code });
        return;
      }
      res.status(500).json({ ok: false, reason: "server_error" });
    }
  })
);
