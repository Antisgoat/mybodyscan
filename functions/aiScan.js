import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import admin from "firebase-admin";
import fetch from "node-fetch";

const REPLICATE_API_TOKEN = defineSecret("REPLICATE_API_TOKEN");

export const runBodyScan = onCall({ secrets: [REPLICATE_API_TOKEN] }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Authentication required");
  }
  const files = Array.isArray(request.data?.files) ? request.data.files : [];
  if (!files.length) {
    throw new HttpsError("invalid-argument", "files required");
  }

  const db = admin.firestore();
  const userRef = db.doc(`users/${uid}`);
  const userSnap = await userRef.get();
  const available = userSnap.get("credits.available") || 0;
  if (available < 1) {
    throw new HttpsError("failed-precondition", "Insufficient credits");
  }

  const scanRef = db.collection(`users/${uid}/scans`).doc();
  const isEmulator = process.env.FUNCTIONS_EMULATOR === "true" || process.env.NODE_ENV === "test";
  let result;

  if (isEmulator) {
    result = { bodyFatPct: 18.7, weightKg: 78.1, bmi: 24.6, mock: true };
    await scanRef.set({
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      files,
      provider: "mock",
      status: "succeeded",
      result,
    });
  } else {
    const bucket = admin.storage().bucket();
    const signed = await Promise.all(
      files.map(async (p) => {
        const [url] = await bucket.file(p).getSignedUrl({
          action: "read",
          expires: Date.now() + 15 * 60 * 1000,
        });
        return url;
      })
    );
    const token = REPLICATE_API_TOKEN.value();
    if (!token) {
      throw new HttpsError("failed-precondition", "Missing Replicate token");
    }
    const createRes = await fetch("https://api.replicate.com/v1/predictions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        version: "TODO", // TODO: specify model version
        input: { images: signed },
      }),
    });
    const createJson = await createRes.json();
    let status = createJson.status;
    let pollUrl = createJson.urls?.get || `https://api.replicate.com/v1/predictions/${createJson.id}`;
    while (status === "starting" || status === "processing") {
      await new Promise((r) => setTimeout(r, 1000));
      const pollRes = await fetch(pollUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const pollJson = await pollRes.json();
      status = pollJson.status;
      if (status === "succeeded") {
        result = {
          bodyFatPct: pollJson.output?.body_fat_pct,
          weightKg: pollJson.output?.weight_kg,
          bmi: pollJson.output?.bmi,
        };
      } else if (status === "failed") {
        throw new HttpsError("internal", "Replicate prediction failed");
      }
    }
    await scanRef.set({
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      files,
      provider: "replicate",
      status: "succeeded",
      result,
    });
  }

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    const avail = snap.get("credits.available") || 0;
    if (avail < 1) {
      throw new HttpsError("failed-precondition", "Insufficient credits");
    }
    tx.update(userRef, { "credits.available": admin.firestore.FieldValue.increment(-1) });
    const ledgerRef = userRef.collection("ledger").doc();
    tx.set(ledgerRef, {
      type: "debit",
      amount: 1,
      source: "scan",
      ts: admin.firestore.FieldValue.serverTimestamp(),
      scanId: scanRef.id,
    });
  });

  return { scanId: scanRef.id, result };
});
