import { onRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { defineString } from "firebase-functions/params";
import { getAppCheck } from "firebase-admin/app-check";
import { scanScanIdPrefix } from "../scan/paths.js";

const APP_CHECK_MODE = defineString("APP_CHECK_MODE"); // "SOFT" | "HARD" (default SOFT)

export const deleteScan = onRequest(
  { cors: true, timeoutSeconds: 540 },
  async (req, res) => {
    if (req.method === "OPTIONS") return res.status(204).end();
    if (req.method !== "POST")
      return jsonError(res, 405, "method_not_allowed", "Use POST");

    const authz = String(req.headers.authorization || "");
    const idToken = authz.startsWith("Bearer ") ? authz.slice(7) : "";
    if (!idToken)
      return jsonError(res, 401, "unauthorized", "Missing ID token");

    // App Check soft/hard
    const mode = (APP_CHECK_MODE.value() || "SOFT").toUpperCase();
    const acToken = String(req.headers["x-firebase-app-check"] || "");
    if (!acToken) {
      logger.warn("appcheck_missing_soft");
    } else {
      try {
        await getAppCheck().verifyToken(acToken);
      } catch (e: any) {
        logger.warn("appcheck_invalid_soft", { err: String(e?.message || e) });
      }
    }

    try {
      const decoded = await getAuth().verifyIdToken(idToken, true);
      const uid = decoded.uid;
      const scanId = String((req.body?.scanId ?? "").trim());
      if (!scanId) return jsonError(res, 400, "bad_request", "Missing scanId");

      const db = getFirestore();
      const docRef = db.doc(`users/${uid}/scans/${scanId}`);
      const snap = await docRef.get();
      if (!snap.exists)
        return jsonError(res, 404, "not_found", "Scan not found");

      // Delete storage files under both legacy and current prefixes
      const bucket = getStorage().bucket();
      await Promise.all([
        bucket
          .deleteFiles({ prefix: scanScanIdPrefix({ uid, scanId }) })
          .catch(() => {}),
        bucket
          .deleteFiles({ prefix: `scans/${uid}/${scanId}/` })
          .catch(() => {}),
      ]);

      await docRef.delete();
      logger.info("deleteScan_ok", { uid, scanId });
      return jsonOk(res, { scanId });
    } catch (err: any) {
      logger.error("deleteScan_error", { err: String(err?.message || err) });
      return jsonError(res, 500, "internal", "Failed to delete scan");
    }
  }
);

function withCors(res: any) {
  res.set("Access-Control-Allow-Origin", "*");
  res.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Firebase-AppCheck"
  );
}
function jsonOk(res: any, data?: any) {
  withCors(res);
  res.status(200).json({ ok: true, ...(data ? { data } : {}) });
}
function jsonError(res: any, http: number, code: string, message: string) {
  withCors(res);
  res.status(http).json({ ok: false, error: { code, message } });
}
