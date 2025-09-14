import { onRequest } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getApps, initializeApp } from "firebase-admin/app";
import { defineSecret } from "firebase-functions/params";
import { getScanProvider } from "./providers/index.js";
import type { ScanInput } from "./providers/scanProvider.js";

const replicateKey = defineSecret("REPLICATE_API_KEY");
const replicateModel = defineSecret("REPLICATE_MODEL");

if (!getApps().length) initializeApp();
const db = getFirestore();

export const processQueuedScanHttp = onRequest({ region: "us-central1", secrets: [replicateKey, replicateModel] }, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).send("Method not allowed");
    return;
  }
  const { uid, scanId } = req.body as { uid: string; scanId: string };
  if (!uid || !scanId) {
    res.status(400).send("uid and scanId required");
    return;
  }
  const scanRef = db.doc(`users/${uid}/scans/${scanId}`);
  const snap = await scanRef.get();
  if (!snap.exists) {
    res.status(404).send("Scan not found");
    return;
  }
  const data = snap.data() as { status: string; input: ScanInput };
  if (data.status !== "queued") {
    res.status(400).send("Scan not queued");
    return;
  }
  const provider = await getScanProvider();
  const output = await provider.analyze(data.input || {});
  await scanRef.update({
    status: "completed",
    bfPercent: output.bfPercent,
    bmi: output.bmi,
    weightLb: output.weightLb,
    source: output.provider,
    completedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  res.json(output);
});
