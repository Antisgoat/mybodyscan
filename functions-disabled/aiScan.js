import { onCall, HttpsError } from "firebase-functions/v2/https";
import functions from "firebase-functions";
import admin from "firebase-admin";
import fetch from "node-fetch";

function rand(min, max) {
  return Math.round((Math.random() * (max - min) + min) * 10) / 10;
}

export const runBodyScan = onCall({ region: "us-central1", enforceAppCheck: true }, async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Authentication required");
  const file = typeof req.data?.file === "string" ? req.data.file : "";
  if (!file) throw new HttpsError("invalid-argument", "file required");

  const db = admin.firestore();
  const userRef = db.collection("users").doc(uid);
  const scanRef = userRef.collection("scans").doc();
  const scanId = scanRef.id;

  let provider = functions.config().scan?.provider || "leanlense";
  console.log("runBodyScan:start", { uid, scanId, provider });

  let result;

  try {
    if (provider === "leanlense") {
      const cfg = functions.config().leanlense || {};
      const apiKey = cfg.api_key;
      const endpoint = cfg.endpoint;
      if (!apiKey || !endpoint) {
        console.log("scan:request", { scanId, provider: "mock" });
        provider = "mock";
      } else {
        console.log("scan:request", { scanId, provider });
        const bucket = admin.storage().bucket();
        const [buffer] = await bucket.file(file).download();
        const form = new FormData();
        form.append("image", new Blob([buffer]), "photo.jpg");
        const controller = new AbortController();
        const to = setTimeout(() => controller.abort(), 120000);
        const resp = await fetch(endpoint, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}` },
          body: form,
          signal: controller.signal,
        });
        clearTimeout(to);
        if (!resp.ok) throw new HttpsError("internal", "Leanlense API error");
        const json = await resp.json();
        result = {
          bfPercent: Number(
            json.bfPercent ?? json.bodyFat ?? json.body_fat ?? json.bodyFatPct
          ),
          weight: json.weight ?? json.weightKg ?? json.weight_kg ?? null,
          BMI: json.BMI ?? json.bmi ?? null,
          raw: json,
        };
      }
    }

    if (provider === "replicate") {
      const mv = functions.config().replicate?.model_version;
      if (!mv) {
        throw new HttpsError(
          "failed-precondition",
          "replicate.model_version not configured"
        );
      }
      const token = functions.config().replicate?.api_key;
      if (!token) {
        throw new HttpsError(
          "failed-precondition",
          "replicate.api_key not configured"
        );
      }
      console.log("scan:request", { scanId, provider });
      const createRes = await fetch("https://api.replicate.com/v1/predictions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          version: mv,
          input: { image: file },
        }),
      });
      if (!createRes.ok) throw new HttpsError("internal", "Replicate API error");
      const createJson = await createRes.json();
      let status = createJson.status;
      const pollUrl =
        createJson.urls?.get ||
        `https://api.replicate.com/v1/predictions/${createJson.id}`;
      let retries = 0;
      while (status === "starting" || status === "processing") {
        if (retries++ >= 60)
          throw new HttpsError("deadline-exceeded", "Scan timed out");
        await new Promise((r) => setTimeout(r, 2000));
        const pollRes = await fetch(pollUrl, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!pollRes.ok)
          throw new HttpsError("internal", "Replicate polling failed");
        const pollJson = await pollRes.json();
        status = pollJson.status;
        if (status === "succeeded") {
          result = {
            bfPercent: pollJson.output?.body_fat_pct,
            weight: pollJson.output?.weight_kg,
            BMI: pollJson.output?.bmi,
            raw: pollJson,
          };
        } else if (status === "failed") {
          throw new HttpsError("internal", "Replicate prediction failed");
        }
      }
    }

    if (provider === "mock") {
      console.log("scan:request", { scanId, provider });
      const delay = 2000 + Math.random() * 2000;
      await new Promise((r) => setTimeout(r, delay));
      result = {
        bfPercent: rand(12, 35),
        BMI: rand(20, 32),
        weight: null,
      };
    }

    const doc = {
      uid,
      scanId,
      status: "complete",
      bfPercent: result?.bfPercent ?? null,
      weight: result?.weight ?? null,
      BMI: result?.BMI ?? null,
      provider,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      ...(result?.raw ? { raw: result.raw } : {}),
    };
    await scanRef.set(doc);
    console.log("result:write:ok", { scanId });

    const markerRef = userRef.collection("processed_scans").doc(scanId);
    const ledgerRef = userRef.collection("ledger").doc();
    await db.runTransaction(async (tx) => {
      const marker = await tx.get(markerRef);
      if (marker.exists) return;
      const userSnap = await tx.get(userRef);
      const credits = userSnap.get("credits") || 0;
      if (credits <= 0) {
        throw new HttpsError("failed-precondition", "Insufficient credits");
      }
      tx.update(userRef, {
        credits: admin.firestore.FieldValue.increment(-1),
      });
      tx.set(markerRef, { ts: admin.firestore.FieldValue.serverTimestamp() });
      tx.set(ledgerRef, {
        scanId,
        creditDelta: -1,
        ts: admin.firestore.FieldValue.serverTimestamp(),
      });
    });
    console.log("credits:tx:ok", { uid, scanId, delta: -1 });
    console.log("scan:success", { scanId, provider });
    return { scanId, ...result };
  } catch (e) {
    console.log("scan:error", {
      scanId,
      provider,
      code: e?.code,
      message: e?.message,
    });
    throw e;
  }
});

