import { HttpsError, onRequest } from "firebase-functions/v2/https";
import type { Request, Response } from "express";
import { Timestamp, getFirestore } from "../firebase.js";
import { withCors } from "../middleware/cors.js";
import { requireAuth, verifyAppCheckStrict } from "../http.js";
import { errorCode, statusFromCode } from "../lib/errors.js";

const db = getFirestore();
const MAX_DAILY_FAILS = 3;

function todayKey() {
  const now = new Date();
  return `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(now.getUTCDate()).padStart(2, "0")}`;
}

async function handler(req: Request, res: Response) {
  await verifyAppCheckStrict(req as any);
  const uid = await requireAuth(req);
  const ref = db.doc(`users/${uid}/gate/${todayKey()}`);
  const now = Timestamp.now();
  let remaining = MAX_DAILY_FAILS;

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() as any : {};
    const failed = Number(data.failed || 0) + 1;
    const passed = Number(data.passed || 0);
    remaining = Math.max(0, MAX_DAILY_FAILS - failed);
    tx.set(
      ref,
      {
        failed,
        passed,
        updatedAt: now,
        lastFailedAt: now,
      },
      { merge: true }
    );
  });

  res.json({ ok: true, remaining });
}

export const recordGateFailure = onRequest(
  { invoker: "public" },
  withCors(async (req, res) => {
    try {
      await handler(req as unknown as Request, res as unknown as Response);
    } catch (error: any) {
      if (error instanceof HttpsError) {
        const code = errorCode(error);
        const status = code === "unauthenticated" ? 401 : statusFromCode(code);
        res.status(status).json({ ok: false, reason: code });
        return;
      }
      res.status(500).json({ ok: false, reason: "server_error" });
    }
  })
);
