// IMPORTANT: use .js suffixes so Node ESM can resolve compiled files at runtime.
// Export only Cloud Function handlers - no middleware/util exports, no wildcard exports

import expressModule from "express";
import type { Request, Response } from "express";
import { onRequest } from "firebase-functions/v2/https";
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
const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: false }));
app.use(allowCorsAndOptionalAppCheck);

async function forwardLegacyFunctionRoute(req: Request, res: Response, fnName: string) {
  try {
    const protocol = req.get("x-forwarded-proto") || "https";
    const host = req.get("host");
    if (!host) {
      res.status(500).json({ error: "missing_host" });
      return;
    }
    const target = `${protocol}://${host}/${fnName}`;
    const response = await fetch(target, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: req.get("authorization") || "",
        "x-firebase-appcheck": req.get("x-firebase-appcheck") || "",
      },
      body: JSON.stringify(req.body ?? {}),
    });
    const text = await response.text();
    res.status(response.status);
    res.setHeader("content-type", "application/json");
    res.send(text || "{}");
  } catch (error: any) {
    res.status(502).json({ error: "legacy_route_forward_failed", message: error?.message || "forward_failed" });
  }
}

app.post("/api/getPlan", async (req: Request, res: Response) => {
  await forwardLegacyFunctionRoute(req, res, "getPlan");
});
app.post("/api/getWorkouts", async (req: Request, res: Response) => {
  await forwardLegacyFunctionRoute(req, res, "getWorkouts");
});
app.post("/api/applyCatalogPlan", async (req: Request, res: Response) => {
  await forwardLegacyFunctionRoute(req, res, "applyCatalogPlan");
});
app.get("/api/health", async (_req: Request, res: Response) => {
  res.status(200).json({ ok: true, gateway: "api", ts: new Date().toISOString() });
});

app.use("/api/billing", billingRouter);
app.use("/api/coach", coachRouter);
app.use("/api/nutrition", nutritionRouter);
app.use("/api/system", systemRouter);

export const api = onRequest({ region: "us-central1" }, app);
export { deleteScan } from "./http/deleteScan.js";
