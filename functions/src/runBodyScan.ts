import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import Replicate from "replicate";

if (!getApps().length) initializeApp();
const db = getFirestore();

const replicateKey = defineSecret("REPLICATE_API_KEY");
const replicateModel = defineSecret("REPLICATE_MODEL");

export const runBodyScan = onCall({
  region: "us-central1",
  secrets: [replicateKey, replicateModel],
  memory: "1GiB",
  timeoutSeconds: 300,
}, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Auth required");
  }
  const uid = request.auth.uid;
  const { scanId } = request.data as { scanId: string };
  if (!scanId) throw new HttpsError("invalid-argument", "scanId required");

  const ref = db.doc(`users/${uid}/scans/${scanId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Scan not found");

  await ref.update({ status: "processing", updatedAt: Date.now() });

  try {
    const apiKey = replicateKey.value();
    const model = replicateModel.value() || "cjwbw/ultralytics-pose:9d045f";
    const front = snap.get("assets.front_url") as string | undefined;
    if (!front) throw new Error("front_url missing");
    const replicate = new Replicate({ auth: apiKey });
    await replicate.run(model, { input: { image: front } });

    await ref.update({
      status: "succeeded",
      metrics: { note: "Replicate placeholder metrics" },
      updatedAt: Date.now(),
    });
  } catch (err: any) {
    await ref.update({
      status: "failed",
      logs: [String(err?.message || err)],
      updatedAt: Date.now(),
    });
    throw new HttpsError("internal", err?.message || "scan failed");
  }
});
