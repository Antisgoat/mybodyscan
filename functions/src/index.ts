// IMPORTANT: use .js suffixes so Node ESM can resolve compiled files at runtime.
// Export only Cloud Function handlers - no middleware/util exports, no wildcard exports

export { systemHealth } from "./systemHealth.js";
export { coachChat } from "./coachChat.js";
export { nutritionSearch } from "./nutritionSearch.js";
export { nutritionBarcode } from "./nutritionBarcode.js";
export { startScanSession } from "./scan/beginPaidScan.js";
export { submitScan } from "./scan/submit.js";
export { recordGateFailure } from "./scan/recordGateFailure.js";
export { refundIfNoResult } from "./scan/refundIfNoResult.js";
export { adjustWorkout } from "./workouts.js";
export { stripeWebhook } from "./stripeWebhook.js";
export { createCheckout, createCustomerPortal } from "./http/checkout.js";
export { refreshClaims } from "./claims.js";
export { grantUnlimitedCredits } from "./claims.js";
