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
      res.json({
        ok: true,
        scanId,
        status: data.status ?? null,
        lastStep: (data as any).lastStep ?? null,
        progress: (data as any).progress ?? null,
        errorMessage: (data as any).errorMessage ?? null,
        errorReason: (data as any).errorReason ?? null,
        correlationId: (data as any).correlationId ?? null,
        estimate: (data as any).estimate ?? null,
        workoutPlan: (data as any).workoutPlan ?? null,
        workoutProgram: (data as any).workoutProgram ?? null,
        nutritionPlan: (data as any).nutritionPlan ?? null,
        note: (data as any).note ?? null,
        photoPaths: (data as any).photoPaths ?? null,
        updatedAt: (data as any).updatedAt ?? null,
        completedAt: (data as any).completedAt ?? null,
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

