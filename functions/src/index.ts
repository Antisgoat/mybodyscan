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

export { systemHealth } from "./systemHealth.js";
export { coachChat } from "./coachChat.js";
export { nutritionSearch, nutritionSearchHttp } from "./nutritionSearch.js";
export { nutritionBarcode } from "./nutrition/barcode.js";
export { startScanSession } from "./scan/start.js";
export { submitScan } from "./scan/submit.js";
export { uploadScanPhotoHttp } from "./scan/uploadScanPhotoHttp.js";
export { recordGateFailure } from "./scan/recordGateFailure.js";
export { refundIfNoResult } from "./scan/refundIfNoResult.js";
export {
  adjustWorkout,
  applyCatalogPlan,
  applyCustomPlan,
  generateWorkoutPlan,
  getPlan,
  getWorkouts,
  markExerciseDone,
  previewCustomPlan,
  setWorkoutPlanStatus,
  updateWorkoutPlan,
} from "./workouts.js";
export { stripeWebhook } from "./stripeWebhook.js";
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
app.use("/api/billing", billingRouter);
app.use("/api/coach", coachRouter);
app.use("/api/nutrition", nutritionRouter);
app.use("/api/system", systemRouter);

export const api = onRequest({ region: "us-central1" }, app);
export { deleteScan } from "./http/deleteScan.js";
