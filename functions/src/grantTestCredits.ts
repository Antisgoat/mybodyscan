import * as functions from "firebase-functions";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

initializeApp();

export const grantTestCredits = functions.region("us-central1")
  .https.onCall(async (_data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Auth required");
    }
    const uid = context.auth.uid;
    const db = getFirestore();

    const cfgSnap = await db.doc("config/app").get();
    if (!cfgSnap.exists) {
      throw new functions.https.HttpsError("failed-precondition", "config/app missing");
    }
    const allowFreeScans = cfgSnap.get("allowFreeScans") === true;
    const defaultTestCredits = Number(cfgSnap.get("defaultTestCredits") ?? 0) || 0;
    const whitelist: string[] = cfgSnap.get("testWhitelist") ?? [];

    if (!allowFreeScans) {
      throw new functions.https.HttpsError("failed-precondition", "Free test mode disabled");
    }
    if (!Array.isArray(whitelist) || !whitelist.includes(uid)) {
      throw new functions.https.HttpsError("permission-denied", "Not whitelisted for test mode");
    }
    if (defaultTestCredits <= 0) {
      throw new functions.https.HttpsError("failed-precondition", "defaultTestCredits must be > 0");
    }

    const creditsRef = db.doc(`users/${uid}/private/credits`);
    const res = await db.runTransaction(async (tx) => {
      const snap = await tx.get(creditsRef);
      const current = (snap.exists ? Number(snap.get("total") ?? 0) : 0) || 0;
      const next = current + defaultTestCredits;
      tx.set(
        creditsRef,
        {
          total: next,
          updatedAt: Date.now(),
          source: "test-mode",
        },
        { merge: true }
      );
      return next;
    });

    return { total: res, added: defaultTestCredits };
  });
