import { HttpsError, onRequest } from "firebase-functions/v2/https";
import type { Request } from "firebase-functions/v2/https";
import { Timestamp, getFirestore } from "../firebase";
import { withCors } from "../middleware/cors";
import { softVerifyAppCheck } from "../middleware/appCheck";
import { requireAuth, verifyAppCheckSoft } from "../http";
import { refundCredit } from "./creditUtils";

const db = getFirestore();

async function handler(req: Request, res: any) {
  await softVerifyAppCheck(req as any, res as any);
  await verifyAppCheckSoft(req);
  const uid = await requireAuth(req);
  const body = req.body as { scanId?: string };
  const scanId = body?.scanId || (req.query?.scanId as string | undefined);
  if (!scanId) {
    throw new HttpsError("invalid-argument", "scanId required");
  }

  const scanRef = db.doc(`users/${uid}/scans/${scanId}`);
  const creditRef = db.doc(`users/${uid}/private/credits`);
  const now = Timestamp.now();

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(scanRef);
    if (!snap.exists) {
      throw new HttpsError("not-found", "scan_not_found");
    }
    const data = snap.data() as any;
    if (data.status === "completed" && data.result?.bf_percent != null) {
      throw new HttpsError("failed-precondition", "scan_already_completed");
    }
    if (!data.charged) {
      return;
    }
    await refundCredit(tx, creditRef, `refund:${scanId}`);
    tx.set(
      scanRef,
      {
        charged: false,
        status: "aborted",
        refundedAt: now,
        updatedAt: now,
      },
      { merge: true }
    );
  });

  res.json({ ok: true });
}

export const refundIfNoResult = onRequest(
  withCors(async (req, res) => {
    try {
      await handler(req as Request, res);
    } catch (error: any) {
      if (error instanceof HttpsError) {
        const status =
          error.code === "unauthenticated"
            ? 401
            : error.code === "invalid-argument"
            ? 400
            : error.code === "not-found"
            ? 404
            : error.code === "failed-precondition"
            ? 409
            : 400;
        res.status(status).json({ error: error.message });
        return;
      }
      res.status(500).json({ error: error?.message || "error" });
    }
  })
);
