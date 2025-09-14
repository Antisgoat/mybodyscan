import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getApps, initializeApp } from "firebase-admin/app";
import type { ScanInput } from "./providers/scanProvider.js";

if (!getApps().length) initializeApp();
const db = getFirestore();

export const startScan = onCall({ region: "us-central1" }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Auth required");
  }
  const uid = request.auth.uid;
  const { scanId, input } = request.data as { scanId: string; input: ScanInput };
  if (!scanId) throw new HttpsError("invalid-argument", "scanId required");

  const userRef = db.doc(`users/${uid}`);
  const scanRef = db.doc(`users/${uid}/scans/${scanId}`);
  const creditUseRef = db.doc(`users/${uid}/credit_uses/${scanId}`);

  await db.runTransaction(async (tx) => {
    const userSnap = await tx.get(userRef);
    const credits = (userSnap.get("credits") ?? 0) as number;
    if (credits <= 0) throw new HttpsError("failed-precondition", "No credits");
    tx.set(userRef, { credits: credits - 1, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    tx.set(scanRef, {
      uid,
      status: "queued",
      input,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.set(creditUseRef, {
      scanId,
      usedAt: FieldValue.serverTimestamp(),
    });
  });
  return { scanId };
});
