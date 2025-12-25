import { onRequest, HttpsError } from "firebase-functions/v2/https";
import type { Request, Response } from "firebase-functions/v2/https";
import { getFirestore } from "../firebase.js";
import { allowCorsAndOptionalAppCheck, requireAuthWithClaims } from "../http.js";
import { ensureSoftAppCheckFromRequest } from "../lib/appCheckSoft.js";
import type { ScanDocument } from "../types.js";

const db = getFirestore();

function toTrimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toIso(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const anyVal = value as any;
  if (typeof anyVal?.toDate === "function") {
    try {
      const d = anyVal.toDate();
      if (d instanceof Date) return d.toISOString();
    } catch {
      // ignore
    }
  }
  if (typeof value === "string") {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return null;
}

function statusFromHttpsError(error: HttpsError): number {
  const status = (error as any)?.httpErrorCode?.status;
  if (typeof status === "number") return status;
  switch (error.code) {
    case "invalid-argument":
      return 400;
    case "unauthenticated":
      return 401;
    case "permission-denied":
      return 403;
    case "not-found":
      return 404;
    default:
      return 500;
  }
}

/**
 * Same-origin scan status endpoint (auth required).
 *
 * GET /api/scan/status?scanId=...
 */
export const getScanStatus = onRequest(
  { region: "us-central1", invoker: "public", concurrency: 80 },
  async (req: Request, res: Response) => {
    allowCorsAndOptionalAppCheck(req, res, () => undefined);
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    try {
      if (req.method !== "GET") {
        res.status(405).end();
        return;
      }
      const authContext = await requireAuthWithClaims(req as Request);
      await ensureSoftAppCheckFromRequest(req as Request, {
        fn: "getScanStatus",
        uid: authContext.uid,
        requestId: req.get?.("x-request-id")?.trim() || "unknown",
      });

      const scanId = toTrimmed(req.query.scanId);
      if (!scanId) {
        throw new HttpsError("invalid-argument", "Missing scanId.");
      }

      const ref = db.doc(
        `users/${authContext.uid}/scans/${scanId}`
      ) as FirebaseFirestore.DocumentReference<ScanDocument>;
      const snap = await ref.get();
      if (!snap.exists) {
        throw new HttpsError("not-found", "Scan not found.");
      }
      const data = snap.data() as ScanDocument;

      res.setHeader("Cache-Control", "no-store");
      const doc = {
        ...data,
        // Ensure timestamps are JSON-friendly and parsable by the web client.
        createdAt: toIso((data as any).createdAt),
        updatedAt: toIso((data as any).updatedAt),
        completedAt: toIso((data as any).completedAt),
        lastStepAt: toIso((data as any).lastStepAt),
        processingRequestedAt: toIso((data as any).processingRequestedAt),
        processingStartedAt: toIso((data as any).processingStartedAt),
        processingHeartbeatAt: toIso((data as any).processingHeartbeatAt),
      };
      res.json({
        ok: true,
        scanId,
        doc,
      });
    } catch (err: any) {
      if (err instanceof HttpsError) {
        res.status(statusFromHttpsError(err)).json({
          ok: false,
          code: err.code,
          message: err.message,
        });
        return;
      }
      res.status(500).json({ ok: false, code: "internal", message: "Unable to load scan status." });
    }
  }
);

