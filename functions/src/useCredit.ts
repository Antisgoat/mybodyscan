import { HttpsError, onRequest } from "firebase-functions/v2/https";
import type { Request } from "firebase-functions/v2/https";
import { requireAuth, verifyAppCheckSoft } from "./http";
import { consumeCredit, refreshCreditsSummary } from "./credits";
import { getFirestore } from "./firebase";

const db = getFirestore();

async function handler(req: Request, res: any) {
  await verifyAppCheckSoft(req);
  const uid = await requireAuth(req);
  const ok = await consumeCredit(uid);
  if (!ok) {
    res.status(402).json({ error: "no_credits" });
    return;
  }
  await refreshCreditsSummary(uid);
  const snap = await db.doc(`users/${uid}/private/credits`).get();
  const remaining = (snap.data()?.creditsSummary?.totalAvailable as number | undefined) || 0;
  res.json({ ok: true, remaining });
}

export const useCredit = onRequest(async (req, res) => {
  try {
    await handler(req, res);
  } catch (err: any) {
    if (err instanceof HttpsError) {
      const status = err.code === "unauthenticated" ? 401 : 400;
      res.status(status).json({ error: err.message });
      return;
    }
    res.status(500).json({ error: err?.message || "error" });
  }
});
