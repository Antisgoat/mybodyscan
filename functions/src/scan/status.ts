import { onRequest } from "firebase-functions/v2/https";
import type { Request } from "firebase-functions/v2/https";
import { getFirestore, Timestamp } from "../firebase.js";
import { requireAuth, verifyAppCheckStrict } from "../http.js";
import { withRequestLogging } from "../middleware/logging.js";

const db = getFirestore();

interface StatusResponse {
  scanId: string;
  status: "processing" | "complete" | "failed";
  result?: any;
  error?: string;
  createdAt?: number;
  completedAt?: number;
}

async function handleStatus(req: Request, res: any) {
  await verifyAppCheckStrict(req);
  const { uid } = await requireAuth(req);
  
  const scanId = req.query.scanId as string;
  if (!scanId || typeof scanId !== "string") {
    res.status(400).json({ error: "missing_scan_id" });
    return;
  }

  try {
    const scanRef = db.doc(`users/${uid}/scans/${scanId}`);
    const scanSnap = await scanRef.get();
    
    if (!scanSnap.exists) {
      res.status(404).json({ error: "scan_not_found" });
      return;
    }

    const scanData = scanSnap.data() as any;
    const response: StatusResponse = {
      scanId,
      status: scanData.status || "processing",
    };

    if (scanData.createdAt) {
      response.createdAt = scanData.createdAt.toMillis();
    }
    if (scanData.completedAt) {
      response.completedAt = scanData.completedAt.toMillis();
    }

    if (scanData.status === "complete" && scanData.result) {
      response.result = scanData.result;
    } else if (scanData.status === "failed" && scanData.error) {
      response.error = scanData.error;
    }

    console.info("scan_status_check", { uid, scanId, status: response.status });
    res.json(response);
  } catch (err: any) {
    console.error("scan_status_error", { uid, scanId, message: err?.message });
    res.status(500).json({ error: "server_error" });
  }
}

export const getScanStatus = onRequest(
  { invoker: "public", concurrency: 20, region: "us-central1" },
  withRequestLogging(async (req, res) => {
    try {
      await handleStatus(req as Request, res);
    } catch (err: any) {
      console.error("scan_status_unhandled", { message: err?.message });
      res.status(500).json({ error: "server_error" });
    }
  }, { sampleRate: 0.1 })
);