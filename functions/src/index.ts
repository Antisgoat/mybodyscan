// IMPORTANT: use .js suffixes so Node ESM can resolve compiled files at runtime.
// Export only Cloud Function handlers - no middleware/util exports, no wildcard exports

import { randomUUID } from "node:crypto";
import expressModule from "express";
import type { Request, Response } from "express";
import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { getAuth } from "./firebase.js";
import { billingRouter } from "./billing.js";
import { coachRouter } from "./coach.js";
import { allowCorsAndOptionalAppCheck } from "./http.js";
import { nutritionRouter } from "./nutrition.js";
import { systemRouter } from "./systemRouter.js";

export { health } from "./health.js";
export { systemHealth } from "./systemHealth.js";
export { coachChat } from "./coachChat.js";
export { nutritionSearch, nutritionSearchHttp } from "./nutritionSearch.js";
export { nutritionBarcode } from "./nutrition/barcode.js";
export { startScanSession } from "./scan/start.js";
export { submitScan } from "./scan/submit.js";
export { scanUpload } from "./scan/upload.js";
export { processQueuedScan } from "./scan/worker.js";
export { recordGateFailure } from "./scan/recordGateFailure.js";
export { refundIfNoResult } from "./scan/refundIfNoResult.js";
export {
  adjustWorkout,
  applyCatalogPlan,
  applyCustomPlan,
  generateWorkoutPlan,
  getPlan,
  getWorkouts,
  logWorkoutExercise,
  markExerciseDone,
  previewCustomPlan,
  setWorkoutPlanStatus,
  updateWorkoutPlan,
} from "./workouts.js";
export { stripeWebhook } from "./stripeWebhook.js";
export { revenueCatWebhook } from "./revenueCatWebhook.js";
export { legacyCreateCheckout } from "./createCheckout.js";
export { createCheckout } from "./stripe/createCheckout.js";
export { createCustomerPortal } from "./createCustomerPortal.js";
export { adminGateway } from "./http/admin.js";
// IMPORTANT:
// `telemetryLog` must remain a callable (onCall) for backwards compatibility.
// Hosting rewrites `/telemetry/log` -> `telemetryLogHttp` for browser `fetch`.
export { telemetryLog } from "./system/telemetryLog.js";
export { telemetryLogHttp } from "./http/telemetry.js";
export { uatHelper } from "./http/uat.js";
export { refreshClaims } from "./auth/refreshClaims.js";
export { grantUnlimitedCredits } from "./auth/grantUnlimitedCredits.js";
export { syncEntitlements } from "./syncEntitlements.js";
export { grantProAllowlist } from "./admin/grantProAllowlist.js";
export { adminGrantProEntitlements } from "./admin/adminGrantProEntitlements.js";
export { deleteMyAccount, exportMyData } from "./account.js";
export { systemBootstrap } from "./system.js";
export { deleteAccount } from "./http/deleteAccount.js";
export {
  addMeal,
  deleteMeal,
  getDailyLog,
  getNutritionHistory,
} from "./nutrition.js";

const express = expressModule as any;
export const apiApp = express();
apiApp.use(express.json({ limit: "2mb" }));
apiApp.use(express.urlencoded({ extended: false }));
apiApp.use(allowCorsAndOptionalAppCheck);

function withCorrelation(req: Request, res: Response): string {
  const correlationId =
    (req.get("x-correlation-id") || req.get("x-request-id") || "").trim() ||
    randomUUID();
  res.setHeader("x-correlation-id", correlationId);
  res.setHeader("content-type", "application/json; charset=utf-8");
  return correlationId;
}

async function verifyBearerAuth(req: Request): Promise<string | null> {
  if (process.env.ALLOW_MOCK_AUTH === "true") {
    const mockUid = (req.get("x-mock-auth-uid") || "").trim();
    if (mockUid) return mockUid;
  }
  const authHeader = req.get("authorization") || req.get("Authorization") || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) return null;
  try {
    const decoded = await getAuth().verifyIdToken(match[1]);
    return decoded.uid ?? null;
  } catch {
    return null;
  }
}

async function forwardLegacyFunctionRoute(
  req: Request,
  res: Response,
  fnName: string,
  opts: { requireAuth?: boolean } = { requireAuth: true }
) {
  const correlationId = withCorrelation(req, res);
  try {
    if (opts.requireAuth) {
      const uid = await verifyBearerAuth(req);
      if (!uid) {
        res.status(401).json({ code: "unauthenticated", message: "Authentication required", correlationId });
        return;
      }
    }

    const protocol = req.get("x-forwarded-proto") || "https";
    const host = req.get("host");
    if (!host) {
      res.status(500).json({ code: "missing_host", correlationId });
      return;
    }

    const target = `${protocol}://${host}/${fnName}`;
    const response = await fetch(target, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        authorization: req.get("authorization") || "",
        "x-firebase-appcheck": req.get("x-firebase-appcheck") || "",
        "x-correlation-id": correlationId,
      },
      body: JSON.stringify((req.body && typeof req.body === "object" ? req.body : req.query) ?? {}),
    });

    const text = await response.text();
    const contentType = response.headers.get("content-type") || "";
    let payload: unknown = {};
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = {
          code: "non_json_upstream",
          message: "Upstream returned non-JSON response",
          correlationId,
          upstreamStatus: response.status,
        };
      }
    }

    logger.info("api.legacy_forward", {
      fnName,
      method: req.method,
      correlationId,
      status: response.status,
      upstreamContentType: contentType,
    });

    res.status(response.status).json(payload);
  } catch (error: any) {
    logger.error("api.legacy_forward_failed", {
      fnName,
      correlationId,
      message: error?.message || "forward_failed",
    });
    res.status(502).json({ code: "legacy_route_forward_failed", message: error?.message || "forward_failed", correlationId });
  }
}

function registerLegacyRoute(path: string, fnName: string, requireAuth = true) {
  apiApp.all(path, async (req: Request, res: Response) => {
    await forwardLegacyFunctionRoute(req, res, fnName, { requireAuth });
  });
  apiApp.all(`/api${path}`, async (req: Request, res: Response) => {
    await forwardLegacyFunctionRoute(req, res, fnName, { requireAuth });
  });
}

registerLegacyRoute("/getPlan", "getPlan", true);
registerLegacyRoute("/getWorkouts", "getWorkouts", true);
registerLegacyRoute("/applyCatalogPlan", "applyCatalogPlan", true);

apiApp.all("/health", async (req: Request, res: Response) => {
  const correlationId = withCorrelation(req, res);
  res.status(200).json({ ok: true, time: new Date().toISOString(), version: process.env.K_REVISION || "dev", correlationId });
});
apiApp.all("/api/health", async (req: Request, res: Response) => {
  const correlationId = withCorrelation(req, res);
  res.status(200).json({ ok: true, time: new Date().toISOString(), version: process.env.K_REVISION || "dev", correlationId });
});

apiApp.use("/billing", billingRouter);
apiApp.use("/api/billing", billingRouter);
apiApp.use("/coach", coachRouter);
apiApp.use("/api/coach", coachRouter);
apiApp.use("/nutrition", nutritionRouter);
apiApp.use("/api/nutrition", nutritionRouter);
apiApp.use("/system", systemRouter);
apiApp.use("/api/system", systemRouter);

export const api = onRequest({ region: "us-central1" }, apiApp);
export { deleteScan } from "./http/deleteScan.js";
