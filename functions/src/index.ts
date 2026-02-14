// IMPORTANT: use .js suffixes so Node ESM can resolve compiled files at runtime.
// Export only Cloud Function handlers - no middleware/util exports, no wildcard exports

import expressModule from "express";
import type { Request, Response } from "express";
import { randomUUID } from "node:crypto";
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
const apiRouter = express.Router();
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: false }));

const allowedOrigins = new Set([
  "https://mybodyscanapp.com",
  "https://www.mybodyscanapp.com",
  "capacitor://localhost",
  "http://localhost",
]);

function buildError(code: string, message: string, ref = randomUUID().slice(0, 8)) {
  return { ok: false as const, error: { code, message, ref } };
}

function applyGatewayCors(req: Request, res: Response) {
  const origin = req.get("origin") || "";
  if (allowedOrigins.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Firebase-AppCheck");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
}

app.use((req: Request, res: Response, next: () => void) => {
  applyGatewayCors(req, res);
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
});
app.use(allowCorsAndOptionalAppCheck);

async function forwardLegacyFunctionRoute(req: Request, res: Response, fnName: string) {
  try {
    const protocol = req.get("x-forwarded-proto") || "https";
    const host = req.get("host");
    if (!host) {
      const payload = buildError("missing_host", "Missing host header");
      res.status(500).json(payload);
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
    let body: any = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = buildError("upstream_invalid_json", "Upstream returned invalid JSON");
    }
    if (response.ok) {
      res.status(response.status).json({ ok: true, data: body });
      return;
    }
    const ref = randomUUID().slice(0, 8);
    console.error("api_gateway_forward_failed", { fnName, status: response.status, ref, body });
    res
      .status(response.status)
      .json(buildError(`upstream_${response.status}`, body?.message || body?.error || "Request failed", ref));
  } catch (error: any) {
    const ref = randomUUID().slice(0, 8);
    console.error("legacy_route_forward_failed", { fnName, ref, message: error?.message });
    res.status(502).json(buildError("legacy_route_forward_failed", error?.message || "forward_failed", ref));
  }
}

apiRouter.post("/getPlan", async (req: Request, res: Response) => {
  await forwardLegacyFunctionRoute(req, res, "getPlan");
});
apiRouter.post("/getWorkouts", async (req: Request, res: Response) => {
  await forwardLegacyFunctionRoute(req, res, "getWorkouts");
});
apiRouter.post("/applyCatalogPlan", async (req: Request, res: Response) => {
  await forwardLegacyFunctionRoute(req, res, "applyCatalogPlan");
});
apiRouter.get("/health", async (_req: Request, res: Response) => {
  res.status(200).json({ ok: true, gateway: "api", ts: new Date().toISOString() });
});

apiRouter.use("/billing", billingRouter);
apiRouter.use("/coach", coachRouter);
apiRouter.use("/nutrition", nutritionRouter);
apiRouter.use("/system", systemRouter);

app.use("/", apiRouter);
app.use("/api", apiRouter);

export const apiAppForTest = app;
export const api = onRequest({ region: "us-central1" }, app);
export { deleteScan } from "./http/deleteScan.js";
