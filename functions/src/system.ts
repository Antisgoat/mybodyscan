import * as https from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { uidFromAuth } from "./util/auth.js";

const allow = [
  "https://mybodyscanapp.com",
  "https://mybodyscan-f3daf.web.app",
  "https://mybodyscan-f3daf.firebaseapp.com",
];
function cors(req: any, res: any) {
  const origin = req.headers.origin || "";
  if (allow.includes(origin)) {
    res.set("Access-Control-Allow-Origin", origin);
    res.set("Vary","Origin");
    res.set("Access-Control-Allow-Credentials","true");
    res.set("Access-Control-Allow-Headers","Content-Type,Authorization,X-Firebase-AppCheck");
    res.set("Access-Control-Allow-Methods","POST,OPTIONS");
  }
  if (req.method === "OPTIONS") { res.status(204).end(); return true; }
  return false;
}

async function grantCredits(uid: string, amount: number, reason: string) {
  const db = getFirestore();
  const userRef = db.doc(`users/${uid}`);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    const now = new Date();
    const months = Number(process.env.CREDIT_EXP_MONTHS || 24);
    const exp = new Date(now.getTime()); exp.setMonth(exp.getMonth() + months);
    if (!snap.exists) {
      tx.set(userRef, { creditsAvailable: 0, createdAt: now, updatedAt: now }, { merge: true });
    }
    const ledgerRef = userRef.collection("credits").doc();
    tx.set(ledgerRef, { amount, reason, createdAt: now, expiresAt: exp, source: "bootstrap" });
    tx.set(userRef, {
      creditsAvailable: FieldValue.increment(amount),
      credits: FieldValue.increment(amount), // legacy alias
      updatedAt: now,
    }, { merge: true });
  });
}

export const systemBootstrap = https.onRequest({ region: "us-central1" }, async (req, res) => {
  try {
    if (cors(req, res)) return;
    if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }

    const auth = await uidFromAuth(req);
    if (!auth) { res.status(401).json({ error: "unauthenticated" }); return; }

    const adminCsv = (process.env.ADMIN_EMAILS_CSV || "").toLowerCase();
    const emails = adminCsv.split(",").map(s => s.trim()).filter(Boolean);
    const isAdminEmail = !!auth.email && emails.includes(auth.email!);

    let claimsUpdated = false;
    if (isAdminEmail) {
      const user = await getAuth().getUser(auth.uid);
      const claims = user.customClaims || {};
      if (!claims.admin) {
        await getAuth().setCustomUserClaims(auth.uid, { ...claims, admin: true });
        claimsUpdated = true;
      }
      const min = Number(process.env.ADMIN_BOOTSTRAP_CREDITS || 50);
      const db = getFirestore();
      const u = await db.doc(`users/${auth.uid}`).get();
      const current = Number(u.get("creditsAvailable") || u.get("credits") || 0);
      if (current < min) {
        await grantCredits(auth.uid, min - current, "admin-bootstrap");
      }
    }

    res.json({ ok: true, admin: isAdminEmail, claimsUpdated });
  } catch (e) {
    logger.error("systemBootstrap error", e);
    res.status(500).json({ error: "bootstrap_failed" });
  }
});
