export { startScan, processQueuedScanHttp } from "./scan.js";
export { nutritionSearch } from "./nutritionSearch.js";
export { coachChat } from "./coachChat.js";
export { ensureTestCredits } from "./testWhitelist.js";
export { submitScan } from "./scan/submit.js";
export { startScanSession } from "./scan/start.js";
export { refundIfNoResult } from "./scan/refundIfNoResult.js";
export { beginPaidScan } from "./scan/beginPaidScan.js";
export { health } from "./health.js";

import { onRequest } from "firebase-functions/v2/https";

import { hasStripe } from "./env.js";
import { withCors } from "./middleware/cors.js";

let paymentsModule: typeof import("./payments.js") | null = null;
let stripeWebhookModule: typeof import("./stripeWebhook.js") | null = null;

if (hasStripe()) {
  try {
    paymentsModule = await import("./payments.js");
  } catch (error) {
    console.warn("payments_module_load_failed", {
      message: error instanceof Error ? error.message : String(error),
    });
  }
  try {
    stripeWebhookModule = await import("./stripeWebhook.js");
  } catch (error) {
    console.warn("stripe_webhook_module_load_failed", {
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

const paymentsDisabled = onRequest(
  { region: "us-central1", invoker: "public" },
  withCors(async (_req, res) => {
    res.status(501).json({ error: "payments_disabled" });
  })
);

const stripeWebhookDisabled = onRequest(
  { region: "us-central1" },
  async (_req, res) => {
    res.status(501).json({ error: "payments_disabled" });
  }
);

export const createCheckout =
  paymentsModule?.createCheckout ?? paymentsDisabled;

export const createCustomerPortal =
  paymentsModule?.createCustomerPortal ?? paymentsDisabled;

export const stripeWebhook =
  stripeWebhookModule?.stripeWebhook ?? stripeWebhookDisabled;
