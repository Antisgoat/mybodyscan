import { onRequest } from "firebase-functions/v2/https";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { consumeCredit, refreshCreditsSummary } from "./credits";

export const useCredit = onRequest(async (req, res) => {
  try {
    const authHeader = req.get("authorization") || "";
    const match = authHeader.match(/^Bearer (.+)$/);
    if (!match) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const decoded = await getAuth().verifyIdToken(match[1]);
    const uid = decoded.uid;
    const ok = await consumeCredit(uid);
    if (!ok) {
      res.status(402).json({ error: "No credits" });
      return;
    }
    await refreshCreditsSummary(uid);
    const snap = await getFirestore()
      .doc(`users/${uid}/private/credits`)
      .get();
    const remaining =
      (snap.data()?.creditsSummary?.totalAvailable as number | undefined) || 0;
    res.json({ ok: true, remaining });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
