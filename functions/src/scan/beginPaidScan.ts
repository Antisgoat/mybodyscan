import { HttpsError, onRequest } from "firebase-functions/v2/https";
import type { Request } from "firebase-functions/v2/https";
import { Timestamp, getFirestore } from "../firebase";
import { withCors } from "../middleware/cors";
import { softVerifyAppCheck } from "../middleware/appCheck";
import { requireAuth, verifyAppCheckSoft } from "../http";
import { consumeCreditBuckets } from "./creditUtils";

const db = getFirestore();
const MAX_DAILY_FAILS = 3;

function todayKey() {
  const now = new Date();
  return `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(now.getUTCDate()).padStart(2, "0")}`;
}

async function ensureDailyLimit(uid: string) {
  const ref = db.doc(`users/${uid}/gate/${todayKey()}`);
  const snap = await ref.get();
  const count = snap.exists ? Number(snap.data()?.failures || 0) : 0;
  if (count >= MAX_DAILY_FAILS) {
    throw new HttpsError("resource-exhausted", "too_many_failed_gates");
  }
}

async function checkDuplicate(uid: string, hashes: string[]): Promise<boolean> {
  if (!hashes.length) return false;
  const recentQuery = await db
    .collection(`users/${uid}/scans`)
    .orderBy("completedAt", "desc")
    .limit(10)
    .get();
  for (const docSnap of recentQuery.docs) {
    const data = docSnap.data() as any;
    const docHashes: string[] = Array.isArray(data.imageHashes) ? data.imageHashes : [];
    if (!docHashes.length) continue;
    const intersection = hashes.some((hash) => docHashes.includes(hash));
    if (intersection) {
      return true;
    }
  }
  return false;
}

async function handler(req: Request, res: any) {
  await softVerifyAppCheck(req as any, res as any);
  await verifyAppCheckSoft(req);
  const uid = await requireAuth(req);
  const body = req.body as { scanId?: string; hashes?: string[]; gateScore?: number; mode?: "2" | "4" };
  if (!body?.scanId || !Array.isArray(body.hashes) || typeof body.gateScore !== "number") {
    throw new HttpsError("invalid-argument", "scanId, hashes, gateScore required");
  }

  await ensureDailyLimit(uid);
  if (await checkDuplicate(uid, body.hashes)) {
    res.status(409).json({ error: "duplicate_scan" });
    return;
  }

  const scanRef = db.doc(`users/${uid}/scans/${body.scanId}`);
  const creditRef = db.doc(`users/${uid}/private/credits`);
  const now = Timestamp.now();
  let remainingCredits = 0;

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
        gateScore: body.gateScore,
        mode: body.mode || "2",
        imageHashes: body.hashes,
        gate: { clientScore: body.gateScore, authorizedAt: now },
      },
      { merge: true }
    );
  });

  res.json({ ok: true, remainingCredits });
}

export const beginPaidScan = onRequest(
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
            : error.code === "resource-exhausted"
            ? 429
            : error.code === "failed-precondition"
            ? 402
            : 400;
        res.status(status).json({ error: error.message });
        return;
      }
      res.status(500).json({ error: error?.message || "error" });
    }
  })
);
