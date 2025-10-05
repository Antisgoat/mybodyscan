// Legacy scan endpoints (kept for backward compatibility)
export { startScan, processQueuedScanHttp } from "./scan.js";

// New scan pipeline (OpenAI Vision)
export { startScanSession } from "./scan/start.js";
export { submitScan } from "./scan/submit.js";
export { beginPaidScan } from "./scan/beginPaidScan.js";
export { recordGateFailure } from "./scan/recordGateFailure.js";
export { refundIfNoResult } from "./scan/refundIfNoResult.js";

// Other endpoints
export { createCheckout, createCustomerPortal } from "./payments.js";
export { stripeWebhook } from "./stripeWebhook.js";
export { nutritionSearch } from "./nutritionSearch.js";
export { coachChat } from "./coachChat.js";
