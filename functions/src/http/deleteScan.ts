import { onRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { getAppCheck } from "firebase-admin/app-check";
import {
  scanMediaPrefixes,
  deleteScanMediaAndRecords,
  previewBlocksDeletion,
} from "../lib/scanMediaDeletion.js";
import { getAppCheckMode } from "../lib/env.js";
import { readFirebaseAppCheckHeader } from "../lib/appCheckHeader.js";

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
    const mode = getAppCheckMode();
    const acToken = readFirebaseAppCheckHeader(req.headers);
    if (!acToken) {
      logger.warn(
        mode === "strict" ? "appcheck_missing_strict" : "appcheck_missing_soft"
      );
      if (mode === "strict") {
        return jsonError(
          res,
          403,
          "app_check_required",
          "Valid App Check token required"
        );
      }
    } else {
      try {
        await getAppCheck().verifyToken(acToken);
      } catch (e: any) {
        logger.warn(
          mode === "strict"
            ? "appcheck_invalid_strict"
            : "appcheck_invalid_soft",
          { err: String(e?.message || e) }
        );
        if (mode === "strict") {
          return jsonError(
            res,
            403,
            "app_check_invalid",
            "Valid App Check token required"
          );
        }
      }
    }

    try {
      const decoded = await getAuth().verifyIdToken(idToken, true);
      const uid = decoded.uid;
      const scanId =
        typeof req.body?.scanId === "string" ? req.body.scanId.trim() : "";
      try {
        scanMediaPrefixes(uid, scanId);
      } catch {
        return jsonError(res, 400, "bad_request", "Invalid scan identifier");
      }

      const db = getFirestore();
      const docRef = db.doc(`users/${uid}/scans/${scanId}`);
      const snap = await docRef.get();
      if (!snap.exists)
        return jsonError(res, 404, "not_found", "Scan not found");

      const previewRef = db.doc(
        `users/${uid}/transformationPreviews/${scanId}`
      );
      const canDelete = await db.runTransaction(async (tx) => {
        const [current, preview] = await Promise.all([
          tx.get(docRef),
          tx.get(previewRef),
        ]);
        if (!current.exists) return false;
        if (
          ["uploading", "queued", "processing", "running"].includes(
            current.data()?.status
          ) ||
          previewBlocksDeletion(preview.data())
        )
          return false;
        tx.update(docRef, { deletionRequestedAt: new Date() });
        return true;
      });
      if (!canDelete)
        return jsonError(
          res,
          409,
          "scan_busy",
          "Wait for the scan or preview to finish, then retry deletion."
        );

      const bucket = getStorage().bucket();
      await deleteScanMediaAndRecords(uid, scanId, {
        deletePrefix: (prefix) => bucket.deleteFiles({ prefix }),
        deleteRecords: async () => {
          await db.recursiveDelete(previewRef);
          await db.recursiveDelete(docRef);
        },
      });
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
