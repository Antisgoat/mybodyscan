// IMPORTANT: use .js suffixes so Node ESM can resolve compiled files at runtime.
// Only export Cloud Function handlers (onRequest/onCall). No middleware/util exports, no wildcard exports.

export { systemHealth } from "./systemHealth.js";
export { coachChat } from "./coachChat.js";
export { nutritionSearch } from "./nutritionSearch.js";
export { nutritionBarcode } from "./nutritionBarcode.js";
export { startScanSession } from "./scan/start.js";
export { submitScan } from "./scan/submit.js";
export { beginPaidScan } from "./scan/beginPaidScan.js";
export { recordGateFailure } from "./scan/recordGateFailure.js";
export { refundIfNoResult } from "./scan/refundIfNoResult.js";
export { adjustWorkout } from "./workouts.js";
export { stripeWebhook } from "./stripeWebhook.js";
export { createCheckout } from "./payments.js";
