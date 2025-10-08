import { onRequest } from "firebase-functions/v2/https";

import type { Request, Response } from "express";
import { hasStripe } from "./lib/env.js";
import { withCors } from "./middleware/cors.js";
import { appCheckSoft } from "./middleware/appCheck.js";

type AnyFunction = (...args: any[]) => any;

type Loader<T extends AnyFunction> = () => Promise<T>;

function createLazyExport<T extends AnyFunction>(load: Loader<T>): T {
  let cached: T | null = null;
  return (async (...args: Parameters<T>): Promise<ReturnType<T>> => {
    if (!cached) {
      cached = await load();
    }
    return cached!(...args);
  }) as T;
}

let scanModulePromise: Promise<typeof import("./scan.js")> | null = null;
function loadScanModule() {
  return (scanModulePromise ??= import("./scan.js"));
}

let nutritionSearchModulePromise: Promise<typeof import("./nutritionSearch.js")> | null = null;
function loadNutritionSearchModule() {
  return (nutritionSearchModulePromise ??= import("./nutritionSearch.js"));
}

let coachChatModulePromise: Promise<typeof import("./coachChat.js")> | null = null;
function loadCoachChatModule() {
  return (coachChatModulePromise ??= import("./coachChat.js"));
}

let testWhitelistModulePromise: Promise<typeof import("./testWhitelist.js")> | null = null;
function loadTestWhitelistModule() {
  return (testWhitelistModulePromise ??= import("./testWhitelist.js"));
}

let submitScanModulePromise: Promise<typeof import("./scan/submit.js")> | null = null;
function loadSubmitScanModule() {
  return (submitScanModulePromise ??= import("./scan/submit.js"));
}

let scanStartModulePromise: Promise<typeof import("./scan/start.js")> | null = null;
function loadScanStartModule() {
  return (scanStartModulePromise ??= import("./scan/start.js"));
}

let scanRefundModulePromise: Promise<typeof import("./scan/refundIfNoResult.js")> | null = null;
function loadScanRefundModule() {
  return (scanRefundModulePromise ??= import("./scan/refundIfNoResult.js"));
}

let scanBeginPaidModulePromise: Promise<typeof import("./scan/beginPaidScan.js")> | null = null;
function loadScanBeginPaidModule() {
  return (scanBeginPaidModulePromise ??= import("./scan/beginPaidScan.js"));
}

let healthModulePromise: Promise<typeof import("./health.js")> | null = null;
function loadHealthModule() {
  return (healthModulePromise ??= import("./health.js"));
}

let paymentsModulePromise: Promise<typeof import("./payments.js")> | null = null;
function loadPaymentsModule() {
  return (paymentsModulePromise ??= import("./payments.js"));
}

export const startScan = createLazyExport(() => loadScanModule().then((mod) => mod.startScan));
export const processQueuedScanHttp = createLazyExport(() =>
  loadScanModule().then((mod) => mod.processQueuedScanHttp)
);

export const nutritionSearch = createLazyExport(() =>
  loadNutritionSearchModule().then((mod) => mod.nutritionSearch)
);

export const coachChat = createLazyExport(() => loadCoachChatModule().then((mod) => mod.coachChat));

export const ensureTestCredits = createLazyExport(() =>
  loadTestWhitelistModule().then((mod) => mod.ensureTestCredits)
);

export const submitScan = createLazyExport(() =>
  loadSubmitScanModule().then((mod) => mod.submitScan)
);

export const startScanSession = createLazyExport(() =>
  loadScanStartModule().then((mod) => mod.startScanSession)
);

export const refundIfNoResult = createLazyExport(() =>
  loadScanRefundModule().then((mod) => mod.refundIfNoResult)
);

export const beginPaidScan = createLazyExport(() =>
  loadScanBeginPaidModule().then((mod) => mod.beginPaidScan)
);

export const health = createLazyExport(() => loadHealthModule().then((mod) => mod.health));

function withAppCheckSoftMiddleware(handler: (req: Request, res: Response) => Promise<void> | void) {
  return async (req: Request, res: Response) => {
    let proceeded = false;
    await new Promise<void>((resolve) => {
      let resolved = false;
      const emitter: any = res;
      const cleanup = () => {
        if (!resolved) {
          resolved = true;
          emitter.off?.("finish", cleanup as any);
          emitter.off?.("close", cleanup as any);
          resolve();
        }
      };
      emitter.once?.("finish", cleanup as any);
      emitter.once?.("close", cleanup as any);
      appCheckSoft(req, res, () => {
        proceeded = true;
        cleanup();
      });
      // In case the middleware responds synchronously without next().
      if (res.headersSent) {
        cleanup();
      }
    });
    if (!proceeded || res.headersSent) {
      return;
    }
    await handler(req, res);
  };
}

const respondPaymentsDisabled = withAppCheckSoftMiddleware(async (_req, res) => {
  res.status(501).json({ error: "payments_disabled" });
});

const paymentsDisabled = onRequest(
  { region: "us-central1", invoker: "public" },
  withCors(async (req, res) => {
    await respondPaymentsDisabled(req as Request, res as Response);
  })
);

const stripeWebhookDisabled = onRequest({ region: "us-central1" }, async (req, res) => {
  await respondPaymentsDisabled(req as Request, res as Response);
});

export const createCheckout = createLazyExport(async () => {
  if (!hasStripe()) {
    return paymentsDisabled;
  }
  const mod = await loadPaymentsModule();
  return mod.createCheckout;
});

export const createCustomerPortal = createLazyExport(async () => {
  if (!hasStripe()) {
    return paymentsDisabled;
  }
  const mod = await loadPaymentsModule();
  return mod.createCustomerPortal;
});

export const stripeWebhook = createLazyExport(async () => {
  if (!hasStripe()) {
    return stripeWebhookDisabled;
  }
  const mod = await loadPaymentsModule();
  return mod.stripeWebhook;
});

