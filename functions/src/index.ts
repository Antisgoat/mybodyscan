// Scan HTTP and callable endpoints
export { startScanSession, submitScan, processQueuedScanHttp, startScan, runBodyScan, getScanStatus } from "./scan.js";

// Paid scan flow helpers
export { beginPaidScan } from "./scan/beginPaidScan.js";
export { recordGateFailure } from "./scan/recordGateFailure.js";
export { refundIfNoResult } from "./scan/refundIfNoResult.js";

// Payments and Stripe
export { createCheckout, createCustomerPortal } from "./payments.js";
export { stripeWebhook } from "./stripeWebhook.js";

// Nutrition search + barcode
export { nutritionSearch } from "./nutritionSearch.js";
export { nutritionBarcode } from "./nutritionBarcode.js";

// Coach
export { coachChat } from "./coachChat.js";
