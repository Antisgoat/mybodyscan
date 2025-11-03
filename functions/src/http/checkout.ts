import type { Request, Response } from "express";
import { onRequest } from "firebase-functions/v2/https";
import Stripe from "stripe";

import { FieldValue, getAuth, getFirestore } from "../firebase.js";
import { requireAuth } from "../http.js";
import { getAppOrigin, getPriceAllowlist, getStripeSecret, stripeSecretKeyParam, stripeSecretParam } from "../lib/config.js";

const db = getFirestore();

const allowOrigins = [
  "https://mybodyscanapp.com",
  "https://mybodyscan-f3daf.web.app",
  "https://mybodyscan-f3daf.firebaseapp.com",
];

function cors(req: Request, res: Response): boolean {
  const origin = req.headers.origin || "";
  if (allowOrigins.includes(origin)) {
    res.set("Access-Control-Allow-Origin", origin);
    res.set("Vary", "Origin");
    res.set("Access-Control-Allow-Credentials", "true");
    res.set("Access-Control-Allow-Headers", "Content-Type,Authorization,X-Firebase-AppCheck");
    res.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  }
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return true;
  }
  return false;
}

function softAppCheck(req: Request) {
  if (!req.get || !req.get("X-Firebase-AppCheck")) {
    console.warn("appcheck_missing", { path: req.path });
  }
}

function logInfo(event: string, payload: Record<string, unknown> = {}): void {
  console.info({ event, ...payload });
}

function logWarn(event: string, payload: Record<string, unknown> = {}): void {
  console.warn({ event, ...payload });
}

function describeError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

const FALLBACK_RETURN_HOST = "https://mybodyscanapp.com";
const CONFIGURED_RETURN_HOST = (() => {
  const configured = getAppOrigin();
  if (!configured) return FALLBACK_RETURN_HOST;
  try {
    const url = new URL(configured);
    if (!url.protocol || !url.hostname) {
      return FALLBACK_RETURN_HOST;
    }
    return `${url.protocol}//${url.host}`;
  } catch {
    return FALLBACK_RETURN_HOST;
  }
})();

const AUTHORIZED_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "mybodyscan-f3daf.web.app",
  "mybodyscan-f3daf.firebaseapp.com",
  "mybodyscanapp.com",
  "www.mybodyscanapp.com",
]);

try {
  const configuredHost = new URL(CONFIGURED_RETURN_HOST).hostname;
  AUTHORIZED_HOSTS.add(configuredHost);
  if (configuredHost.startsWith("www.")) {
    AUTHORIZED_HOSTS.add(configuredHost.replace(/^www\./, ""));
  }
} catch {
  // ignore invalid configured origin
}

const PRICE_CONFIG = getPriceAllowlist();
const PRICE_ALLOWLIST = PRICE_CONFIG.allowlist;
const PLAN_TO_PRICE: Record<string, string> = PRICE_CONFIG.planToPrice;
const SUBSCRIPTION_PRICE_IDS: Set<string> = PRICE_CONFIG.subscriptionPriceIds;

const PLAN_BY_PRICE = (() => {
  const map = new Map<string, string>();
  for (const [plan, price] of Object.entries(PLAN_TO_PRICE)) {
    if (!price) continue;
    if (!map.has(price)) {
      map.set(price, plan);
    }
  }
  return map;
})();

type CheckoutMode = Stripe.Checkout.SessionCreateParams.Mode;

type ErrorMeta = {
  code?: string;
  requestId?: string | null;
  uid?: string;
  priceId?: string | null;
  customerId?: string | null;
  mode?: CheckoutMode | "unknown";
  context?: Record<string, unknown>;
};

type LogPayload = {
  uid?: string | null;
  priceId?: string | null;
  mode?: CheckoutMode | "unknown";
  customerId?: string | null;
  code?: string | null;
  requestId?: string | null;
};

let cachedStripe: { secret: string; client: Stripe } | null = null;

function getStripe(secret: string): Stripe {
  if (cachedStripe && cachedStripe.secret === secret) {
    return cachedStripe.client;
  }
  const client = new Stripe(secret, { apiVersion: "2024-06-20" });
  cachedStripe = { secret, client };
  return client;
}

function getRequestId(req: Request): string | null {
  const direct = req.get("x-request-id");
  if (direct) return direct;
  const trace = req.get("x-cloud-trace-context");
  if (trace) return trace.split("/")[0] ?? trace;
  return null;
}

function resolveAllowedOrigin(originHeader?: string): string | null {
  if (!originHeader || typeof originHeader !== "string") return null;
  try {
    const url = new URL(originHeader);
    if (!AUTHORIZED_HOSTS.has(url.hostname)) {
      return null;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

function applyCors(req: Request, res: Response): { allowedOrigin: string | null; ended: boolean } {
  const originHeader = req.headers.origin as string | undefined;
  const allowedOrigin = resolveAllowedOrigin(originHeader);

  if (allowedOrigin) {
    res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
  res.setHeader("Vary", "Origin");

  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization,X-UAT");
    res.status(204).end();
    return { allowedOrigin, ended: true };
  }

  return { allowedOrigin, ended: false };
}

function hasUatFlag(req: Request): boolean {
  const header = (req.get("x-uat") || req.get("X-UAT") || "").trim().toLowerCase();
  if (header === "1" || header === "true" || header === "yes") return true;
  const queryValue = req.query?.uat;
  if (typeof queryValue === "string") {
    const normalized = queryValue.trim().toLowerCase();
    if (normalized === "1" || normalized === "true" || normalized === "yes") return true;
  }
  return false;
}

async function readCustomerCache(uid: string): Promise<{ customerId: string | null; email: string | null }> {
  try {
    const docRef = db.doc(`users/${uid}/private/stripe`);
    const snap = await docRef.get();
    if (!snap.exists) return { customerId: null, email: null };
    const data = snap.data() as Record<string, unknown> | undefined;
    const customerId = typeof data?.customerId === "string" ? data.customerId.trim() : "";
    const email = typeof data?.email === "string" ? data.email.trim() : "";
    return { customerId: customerId || null, email: email || null };
  } catch (error) {
    logWarn("checkout.cache_read_failed", { uid, message: describeError(error) });
    return { customerId: null, email: null };
  }
}

async function writeCustomerCache(uid: string, customerId: string, email: string | null): Promise<void> {
  try {
    const docRef = db.doc(`users/${uid}/private/stripe`);
    await docRef.set(
      {
        customerId,
        email: email ?? FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  } catch (error) {
    logWarn("checkout.cache_write_failed", { uid, customerId, message: describeError(error) });
  }
}

function escapeForStripeSearch(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function searchCustomerByEmail(stripe: Stripe, email: string): Promise<Stripe.Customer | null> {
  const normalized = email.trim().toLowerCase();
  try {
    const results = await stripe.customers.search({
      query: `email:'${escapeForStripeSearch(normalized)}'`,
      limit: 5,
    });
    if (!Array.isArray(results.data) || results.data.length === 0) {
      return null;
    }
    const exact = results.data.find((item) => typeof item.email === "string" && item.email.trim().toLowerCase() === normalized);
    return exact ?? results.data[0];
  } catch (error) {
    logWarn("checkout.customer_search_failed", { email: normalized, message: describeError(error) });
    return null;
  }
}

async function ensureStripeCustomer(stripe: Stripe, uid: string, email: string): Promise<{ customerId: string; origin: "cache" | "search" | "created" }> {
  const cache = await readCustomerCache(uid);
  if (cache.customerId) {
    try {
      await stripe.customers.update(cache.customerId, { metadata: { uid } });
    } catch (error) {
      logWarn("checkout.customer_update_failed", {
        uid,
        customerId: cache.customerId,
        message: describeError(error),
      });
    }
    return { customerId: cache.customerId, origin: "cache" };
  }

  const existing = await searchCustomerByEmail(stripe, email);
  if (existing) {
    try {
      await stripe.customers.update(existing.id, { metadata: { uid } });
    } catch (error) {
      logWarn("checkout.customer_update_failed", {
        uid,
        customerId: existing.id,
        message: describeError(error),
      });
    }
    await writeCustomerCache(uid, existing.id, email);
    return { customerId: existing.id, origin: "search" };
  }

  const created = await stripe.customers.create({
    email,
    metadata: { uid },
  });

  await writeCustomerCache(uid, created.id, email);
  return { customerId: created.id, origin: "created" };
}

async function resolveCustomerForPortal(
  stripe: Stripe,
  uid: string,
  email: string | null,
  sessionId: string | null,
): Promise<{ customerId: string | null; source: "cache" | "session" | "search" | null }> {
  const cache = await readCustomerCache(uid);
  if (cache.customerId) {
    return { customerId: cache.customerId, source: "cache" };
  }

  if (sessionId) {
    try {
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      const sessionUid = (session.metadata?.uid as string | undefined) ?? session.client_reference_id ?? null;
      if (sessionUid && sessionUid !== uid) {
        logWarn("checkout.portal_session_uid_mismatch", { uid, sessionUid, sessionId });
      } else {
        const customer = session.customer;
        const customerId =
          typeof customer === "string"
            ? customer
            : typeof (customer as Stripe.Customer).id === "string"
              ? (customer as Stripe.Customer).id
              : null;
        if (customerId) {
          const sessionEmail =
            (session.customer_details?.email as string | undefined) ??
            (session.customer_email as string | undefined) ??
            email ??
            null;
          await writeCustomerCache(uid, customerId, sessionEmail);
          return { customerId, source: "session" };
        }
      }
    } catch (error) {
      logWarn("checkout.portal_session_lookup_failed", {
        uid,
        sessionId,
        message: describeError(error),
      });
    }
  }

  if (email) {
    const existing = await searchCustomerByEmail(stripe, email);
    if (existing) {
      await writeCustomerCache(uid, existing.id, existing.email ?? email);
      return { customerId: existing.id, source: "search" };
    }
  }

  return { customerId: null, source: null };
}

function findPlanByPrice(priceId: string | null | undefined): string | null {
  if (!priceId) return null;
  return PLAN_BY_PRICE.get(priceId) ?? null;
}

function resolveRequestedPrice(body: unknown): { priceId: string | null; plan: string | null } {
  if (!body || typeof body !== "object") return { priceId: null, plan: null };
  const payload = body as Record<string, unknown>;
  const directRaw = typeof payload.priceId === "string" ? payload.priceId.trim() : "";
  const planRaw = typeof payload.plan === "string" ? payload.plan.trim() : "";
  const plan = planRaw ? planRaw.toLowerCase() : null;

  if (directRaw) {
    if (PRICE_ALLOWLIST.has(directRaw)) {
      return { priceId: directRaw, plan: plan ?? findPlanByPrice(directRaw) };
    }
    if (plan && PLAN_TO_PRICE[plan]) {
      return { priceId: PLAN_TO_PRICE[plan], plan };
    }
    return { priceId: directRaw, plan };
  }

  if (plan && PLAN_TO_PRICE[plan]) {
    return { priceId: PLAN_TO_PRICE[plan], plan };
  }

  return { priceId: null, plan };
}

function logOutcome(
  svc: "checkout" | "portal",
  ok: boolean,
  payload: LogPayload,
  level: "info" | "error" = ok ? "info" : "error",
): void {
  const event = `payments.${svc}.${ok ? "success" : "failure"}`;
  const data = {
    uid: payload.uid ?? null,
    priceId: payload.priceId ?? null,
    mode: payload.mode ?? null,
    customerId: payload.customerId ?? null,
    code: payload.code ?? null,
    requestId: payload.requestId ?? null,
  };
  if (level === "info") {
    logInfo(event, data);
  } else {
    logWarn(event, data);
  }
}

function createErrorResponse(svc: "checkout" | "portal", res: Response, status: number, error: string, meta?: ErrorMeta): void {
  const code = meta?.code ?? error;
  res.status(status).json({ error, code });
  logWarn(`payments.${svc}.error`, {
    status,
    error,
    code,
    requestId: meta?.requestId ?? null,
    uid: meta?.uid ?? null,
    priceId: meta?.priceId ?? null,
    customerId: meta?.customerId ?? null,
    ...(meta?.context ?? {}),
  });
  logOutcome(svc, false, {
    uid: meta?.uid ?? null,
    priceId: meta?.priceId ?? null,
    mode: meta?.mode ?? "unknown",
    customerId: meta?.customerId ?? null,
    code,
    requestId: meta?.requestId ?? null,
  }, "error");
}

function sendPaymentsDisabled(svc: "checkout" | "portal", res: Response, meta: ErrorMeta): void {
  logWarn("payments.secret_missing", {
    service: svc,
    missing: "STRIPE_SECRET",
    requestId: meta.requestId ?? null,
    uid: meta.uid ?? null,
  });
  res.status(501).json({ error: "payments_disabled", code: "no_secret" });
  logWarn(`payments.${svc}.disabled`, {
    requestId: meta.requestId ?? null,
    uid: meta.uid ?? null,
    priceId: meta.priceId ?? null,
  });
  logOutcome(
    svc,
    false,
    {
      uid: meta.uid ?? null,
      priceId: meta.priceId ?? null,
      mode: meta.mode ?? "unknown",
      customerId: meta.customerId ?? null,
      code: "no_secret",
      requestId: meta.requestId ?? null,
    },
    "error",
  );
}

async function handleCreateCheckout(req: Request, res: Response) {
  if (cors(req, res)) return;
  softAppCheck(req);
  const { allowedOrigin, ended } = applyCors(req, res);
  if (ended) return;

  const requestedOrigin = req.headers.origin as string | undefined;
  if (requestedOrigin && !allowedOrigin) {
    createErrorResponse("checkout", res, 403, "origin_not_allowed", { requestId: getRequestId(req) });
    return;
  }

  if (req.method !== "POST") {
    createErrorResponse("checkout", res, 405, "method_not_allowed", { requestId: getRequestId(req) });
    return;
  }

  const requestId = getRequestId(req);

  let uid: string;
  try {
    uid = await requireAuth(req);
  } catch {
    createErrorResponse("checkout", res, 401, "auth_required", { requestId });
    return;
  }

  let email: string | null = null;
  try {
    const userRecord = await getAuth().getUser(uid);
    email = typeof userRecord.email === "string" ? userRecord.email.trim() : null;
  } catch (error) {
    logWarn("payments.checkout.user_lookup_failed", { uid, message: describeError(error) });
    createErrorResponse("checkout", res, 500, "server_error", {
      code: "user_lookup_failed",
      requestId,
      uid,
      context: { message: describeError(error) },
    });
    return;
  }

  if (!email) {
    createErrorResponse("checkout", res, 400, "missing_email", { requestId, uid, code: "missing_email" });
    return;
  }

  const { priceId: requestedPriceId, plan } = resolveRequestedPrice(req.body);
  const priceId = requestedPriceId?.trim() ?? "";
  if (!priceId || !PRICE_ALLOWLIST.has(priceId)) {
    createErrorResponse("checkout", res, 400, "invalid_price", {
      requestId,
      uid,
      priceId: priceId || null,
      code: "invalid_price",
    });
    return;
  }

  const mode: CheckoutMode = SUBSCRIPTION_PRICE_IDS.has(priceId) ? "subscription" : "payment";

  const isUat = hasUatFlag(req);
  const origin = allowedOrigin || CONFIGURED_RETURN_HOST;

  if (isUat) {
    logOutcome("checkout", true, { uid, priceId, mode, code: "uat", requestId });
    res.json({
      url: `${origin}/__uat/checkout/${priceId}?mode=${mode}`,
      mode,
      priceId,
      plan,
      uat: true,
    });
    return;
  }

  const secret = getStripeSecret();
  if (!secret) {
    sendPaymentsDisabled("checkout", res, { requestId, uid, priceId, mode });
    return;
  }

  let stripe: Stripe;
  try {
    stripe = getStripe(secret);
  } catch (error) {
    logWarn("payments.checkout.init_failed", {
      uid,
      priceId,
      message: describeError(error),
    });
    createErrorResponse("checkout", res, 500, "server_error", {
      code: "stripe_init_failed",
      requestId,
      uid,
      priceId,
      mode,
      context: { message: describeError(error) },
    });
    return;
  }

  let customerId: string;
  try {
    const ensureResult = await ensureStripeCustomer(stripe, uid, email);
    customerId = ensureResult.customerId;
  } catch (error) {
    logWarn("payments.checkout.customer_failed", {
      uid,
      priceId,
      message: describeError(error),
    });
    createErrorResponse("checkout", res, 500, "server_error", {
      code: (error as { code?: string })?.code ?? "stripe_customer_error",
      requestId,
      uid,
      priceId,
      mode,
      context: { message: describeError(error) },
    });
    return;
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode,
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/settings?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/plans?canceled=1`,
      allow_promotion_codes: mode === "subscription",
      client_reference_id: uid,
      metadata: { uid, priceId, plan: plan ?? findPlanByPrice(priceId) ?? "unknown" },
      payment_intent_data: mode === "payment" ? { metadata: { uid, priceId } } : undefined,
      subscription_data: mode === "subscription" ? { metadata: { uid, priceId } } : undefined,
    });

    if (!session?.url) {
      createErrorResponse("checkout", res, 500, "server_error", {
        code: "stripe_session_missing",
        requestId,
        uid,
        priceId,
        customerId,
        mode,
      });
      return;
    }

    logInfo("payments.checkout.session_created", {
      uid,
      priceId,
      mode,
      customerId,
      sessionId: session.id,
    });
    logOutcome("checkout", true, { uid, priceId, mode, customerId, requestId });

    res.json({ url: session.url, sessionId: session.id });
  } catch (error) {
    logWarn("payments.checkout.session_failed", {
      uid,
      priceId,
      customerId,
      message: describeError(error),
    });
    createErrorResponse("checkout", res, 500, "server_error", {
      code: (error as { code?: string })?.code ?? "stripe_error",
      requestId,
      uid,
      priceId,
      customerId,
      mode,
      context: { message: describeError(error) },
    });
  }
}

async function handleCustomerPortal(req: Request, res: Response) {
  if (cors(req, res)) return;
  softAppCheck(req);
  const { allowedOrigin, ended } = applyCors(req, res);
  if (ended) return;

  const requestedOrigin = req.headers.origin as string | undefined;
  if (requestedOrigin && !allowedOrigin) {
    createErrorResponse("portal", res, 403, "origin_not_allowed", { requestId: getRequestId(req) });
    return;
  }

  if (req.method !== "POST") {
    createErrorResponse("portal", res, 405, "method_not_allowed", { requestId: getRequestId(req) });
    return;
  }

  const requestId = getRequestId(req);

  let uid: string;
  try {
    uid = await requireAuth(req);
  } catch {
    createErrorResponse("portal", res, 401, "auth_required", { requestId });
    return;
  }

  const sessionId = typeof req.query?.session_id === "string" ? req.query.session_id.trim() : null;

  let email: string | null = null;
  try {
    const userRecord = await getAuth().getUser(uid);
    email = typeof userRecord.email === "string" ? userRecord.email.trim() : null;
  } catch (error) {
    logWarn("payments.portal.user_lookup_failed", { uid, message: describeError(error) });
    createErrorResponse("portal", res, 500, "server_error", {
      code: "user_lookup_failed",
      requestId,
      uid,
      context: { message: describeError(error) },
    });
    return;
  }

  const isUat = hasUatFlag(req);
  const origin = allowedOrigin || CONFIGURED_RETURN_HOST;

  if (isUat) {
    const cache = await readCustomerCache(uid);
    if (!cache.customerId) {
      createErrorResponse("portal", res, 404, "no_customer", { requestId, uid, code: "no_customer" });
      return;
    }
    logOutcome("portal", true, { uid, customerId: cache.customerId, code: "uat", requestId });
    res.json({ url: `${origin}/__uat/customer-portal/${cache.customerId}`, uat: true });
    return;
  }

  const secret = getStripeSecret();
  if (!secret) {
    sendPaymentsDisabled("portal", res, { requestId, uid });
    return;
  }

  let stripe: Stripe;
  try {
    stripe = getStripe(secret);
  } catch (error) {
    logWarn("payments.portal.init_failed", { uid, message: describeError(error) });
    createErrorResponse("portal", res, 500, "server_error", {
      code: "stripe_init_failed",
      requestId,
      uid,
      context: { message: describeError(error) },
    });
    return;
  }

  let customerId: string | null = null;
  try {
    const resolved = await resolveCustomerForPortal(stripe, uid, email, sessionId);
    customerId = resolved.customerId;
  } catch (error) {
    logWarn("payments.portal.customer_failed", { uid, message: describeError(error) });
    createErrorResponse("portal", res, 500, "server_error", {
      code: (error as { code?: string })?.code ?? "stripe_customer_error",
      requestId,
      uid,
      context: { message: describeError(error) },
    });
    return;
  }

  if (!customerId) {
    createErrorResponse("portal", res, 404, "no_customer", { requestId, uid, code: "no_customer" });
    return;
  }

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/settings`,
    });

    if (!session?.url) {
      createErrorResponse("portal", res, 500, "server_error", {
        code: "stripe_portal_missing",
        requestId,
        uid,
        customerId,
      });
      return;
    }

    logInfo("payments.portal.session_created", { uid, customerId, sessionId: session.id });
    logOutcome("portal", true, { uid, customerId, requestId });

    res.json({ url: session.url });
  } catch (error) {
    logWarn("payments.portal.session_failed", { uid, customerId, message: describeError(error) });
    createErrorResponse("portal", res, 500, "server_error", {
      code: (error as { code?: string })?.code ?? "stripe_error",
      requestId,
      uid,
      customerId,
      context: { message: describeError(error) },
    });
  }
}

export const createCheckout = onRequest(
  { region: "us-central1", secrets: [stripeSecretParam, stripeSecretKeyParam] },
  (req, res) => {
    void handleCreateCheckout(req as Request, res as Response);
  },
);

export const createCustomerPortal = onRequest(
  { region: "us-central1", secrets: [stripeSecretParam, stripeSecretKeyParam] },
  (req, res) => {
    void handleCustomerPortal(req as Request, res as Response);
  },
);

export const LEGACY_PLAN_MAP = PLAN_TO_PRICE;
