import { HttpsError, onRequest } from "firebase-functions/v2/https";
import type { Request, Response } from "express";
import { Timestamp, getFirestore } from "../firebase.js";
import { withCors } from "../middleware/cors.js";
import { requireAuth, verifyAppCheckStrict } from "../http.js";
import { refundCredit } from "./creditUtils.js";
import { errorCode, statusFromCode } from "../lib/errors.js";

const db = getFirestore();

async function handler(req: Request, res: Response) {
  await verifyAppCheckStrict(req as any);
  const uid = await requireAuth(req);
  const body = req.body as { scanId?: string };
  const scanId = body?.scanId || (req.query?.scanId as string | undefined);
  if (!scanId) {
    res.status(400).json({ ok: false, refunded: false, reason: "invalid_request" });
    return;
  }

  const scanRef = db.doc(`users/${uid}/scans/${scanId}`);
  const creditRef = db.doc(`users/${uid}/private/credits`);
  const now = Timestamp.now();

  let refunded = false;
  try {
    await db.runTransaction(async (tx: FirebaseFirestore.Transaction) => {
      const snap = (await tx.get(scanRef)) as unknown as FirebaseFirestore.DocumentSnapshot<FirebaseFirestore.DocumentData>;
      if (!snap.exists) {
        throw new HttpsError("not-found", "scan_not_found");
      }
      const data = snap.data() as any;
      const charged = Boolean(data.charged);
      const completed = data.status === "completed" && data.result?.bf_percent != null;
      if (!charged || completed) {
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
      refunded = true;
    });
  } catch (error: any) {
    if (error instanceof HttpsError) {
      const code = errorCode(error);
      const status = code === "not-found" ? 404 : code === "unauthenticated" ? 401 : statusFromCode(code);
      res.status(status).json({ ok: false, refunded: false, reason: code });
      return;
    }
    res.status(500).json({ ok: false, refunded: false, reason: "server_error" });
    return;
  }

  res.json({ ok: refunded, refunded });
}

export const refundIfNoResult = onRequest(
  { invoker: "public" },
  withCors(async (req, res) => {
    try {
      await handler(req as unknown as Request, res as unknown as Response);
    } catch (error: any) {
      if (error instanceof HttpsError) {
        const code = errorCode(error);
        const status = code === "unauthenticated" ? 401 : statusFromCode(code);
        res.status(status).json({ ok: false, refunded: false, reason: code });
        return;
      }
      res.status(500).json({ ok: false, refunded: false, reason: "server_error" });
    }
  })
);
