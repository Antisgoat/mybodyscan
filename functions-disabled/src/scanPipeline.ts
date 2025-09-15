import { onRequest } from "firebase-functions/v2/https";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

/** Helper to extract uid from Authorization header */
async function requireUser(req: any): Promise<string> {
  const authHeader = req.get("authorization") || "";
  const match = authHeader.match(/^Bearer (.+)$/);
  if (!match) throw new Error("Unauthorized");
  const decoded = await getAuth().verifyIdToken(match[1]);
  return decoded.uid;
}

/** Start a new scan session for the authenticated user. */
export const startScanSession = onRequest(async (req, res) => {
  try {
    const uid = await requireUser(req);
    const db = getFirestore();
    const scanRef = db.collection(`users/${uid}/scans`).doc();
    await scanRef.set({
      status: "awaiting_upload",
      createdAt: Timestamp.now(),
      creditsDebited: false,
    });
    res.json({
      scanId: scanRef.id,
      uploadPathPrefix: `userUploads/${uid}/scans/${scanRef.id}/raw/`,
    });
  } catch (e: any) {
    res.status(e.message === "Unauthorized" ? 401 : 500).json({ error: e.message });
  }
});

/** Submit uploaded files for processing. Simulates processing when API key absent. */
export const submitScan = onRequest(async (req, res) => {
  try {
    const uid = await requireUser(req);
    const body = req.body as { scanId?: string; files?: string[] };
    if (!body?.scanId || !Array.isArray(body.files)) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }
    const db = getFirestore();
    const scanRef = db.doc(`users/${uid}/scans/${body.scanId}`);
    const snap = await scanRef.get();
    if (!snap.exists) {
      res.status(404).json({ error: "Scan not found" });
      return;
    }
    if (process.env.LEANLENSE_API_KEY) {
      await scanRef.set({ status: "processing" }, { merge: true });
      await new Promise((r) => setTimeout(r, 1000));
    }
    await scanRef.set(
      {
        status: "ready",
        processedAt: Timestamp.now(),
        filesCount: body.files.length,
        measurements: { bodyFat: 20 },
      },
      { merge: true }
    );
    res.json({ scanId: body.scanId, status: "ready" });
  } catch (e: any) {
    res.status(e.message === "Unauthorized" ? 401 : 500).json({ error: e.message });
  }
});

/** Return scan document for the authenticated owner. */
export const getScanStatus = onRequest(async (req, res) => {
  try {
    const uid = await requireUser(req);
    const scanId = (req.query.scanId as string) || (req.body?.scanId as string);
    if (!scanId) {
      res.status(400).json({ error: "scanId required" });
      return;
    }
    const snap = await getFirestore().doc(`users/${uid}/scans/${scanId}`).get();
    if (!snap.exists) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json({ id: snap.id, ...snap.data() });
  } catch (e: any) {
    res.status(e.message === "Unauthorized" ? 401 : 500).json({ error: e.message });
  }
});

/** Return scan result measurements if ready. */
export const getScanResult = onRequest(async (req, res) => {
  try {
    const uid = await requireUser(req);
    const scanId = (req.query.scanId as string) || (req.body?.scanId as string);
    if (!scanId) {
      res.status(400).json({ error: "scanId required" });
      return;
    }
    const snap = await getFirestore().doc(`users/${uid}/scans/${scanId}`).get();
    if (!snap.exists) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const data = snap.data() as any;
    if (data.status !== "ready") {
      res.status(409).json({ error: "Not ready" });
      return;
    }
    res.json(data.measurements || {});
  } catch (e: any) {
    res.status(e.message === "Unauthorized" ? 401 : 500).json({ error: e.message });
  }
});
