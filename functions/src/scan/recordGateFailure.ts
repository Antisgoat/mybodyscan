import { HttpsError, onRequest } from "firebase-functions/v2/https";
import type { Request } from "firebase-functions/v2/https";
import { Timestamp, getFirestore } from "../firebase";
import { withCors } from "../middleware/cors";
import { softVerifyAppCheck } from "../middleware/appCheck";
import { requireAuth, verifyAppCheckSoft } from "../http";

const db = getFirestore();
const MAX_DAILY_FAILS = 3;

function todayKey() {
  const now = new Date();
  return `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(now.getUTCDate()).padStart(2, "0")}`;
}

async function handler(req: Request, res: any) {
  await softVerifyAppCheck(req as any, res as any);
  await verifyAppCheckSoft(req);
  const uid = await requireAuth(req);
  const key = todayKey();
  const ref = db.doc(`users/${uid}/gate/${key}`);
  const now = Timestamp.now();
  let remaining = MAX_DAILY_FAILS;

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const count = snap.exists ? Number(snap.data()?.failures || 0) : 0;
    const next = count + 1;
    remaining = Math.max(0, MAX_DAILY_FAILS - next);
    tx.set(ref, { failures: next, updatedAt: now }, { merge: true });
  });

  res.json({ ok: true, remainingAttempts: remaining });
}

export const recordGateFailure = onRequest(
  withCors(async (req, res) => {
    try {
      await handler(req as Request, res);
    } catch (error: any) {
      if (error instanceof HttpsError) {
        const status = error.code === "unauthenticated" ? 401 : 400;
        res.status(status).json({ error: error.message });
        return;
      }
      res.status(500).json({ error: error?.message || "error" });
    }
  })
);
