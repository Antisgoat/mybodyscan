// IMPORTANT: use .js suffixes so Node ESM can resolve compiled files at runtime.
// Export only Cloud Function handlers - no middleware/util exports, no wildcard exports

export { systemHealth } from "./systemHealth.js";
export { coachChat } from "./coachChat.js";
export { nutritionSearch } from "./nutritionSearch.js";
export { nutritionBarcode } from "./nutritionBarcode.js";
export { startScanSession } from "./scan/start.js";
export { submitScan } from "./scan/submit.js";
export { recordGateFailure } from "./scan/recordGateFailure.js";
export { refundIfNoResult } from "./scan/refundIfNoResult.js";
export { adjustWorkout } from "./workouts.js";
export { stripeWebhook } from "./stripeWebhook.js";
export { createCheckout } from "./createCheckout.js";
export { createCustomerPortal } from "./http/checkout.js";
export { adminGateway } from "./http/admin.js";
export { telemetryLog } from "./http/telemetry.js";
export { uatHelper } from "./http/uat.js";
export { refreshClaims } from "./claims.js";
export { grantUnlimitedCredits } from "./claims.js";
export { deleteMyAccount, exportMyData } from "./account.js";
