import type { Request, Response } from "express";
import { onRequest } from "firebase-functions/v2/https";
import Stripe from "stripe";

import { FieldValue, getAuth, getFirestore } from "../firebase.js";
import { requireAuth } from "../http.js";
import { getStripeSecret } from "../lib/env.js";

const db = getFirestore();

const DEFAULT_RETURN_HOST = "https://mybodyscanapp.com";

const AUTHORIZED_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "mybodyscan-f3daf.web.app",
  "mybodyscan-f3daf.firebaseapp.com",
  "mybodyscanapp.com",
  "www.mybodyscanapp.com",
]);

const PRICE_ALLOWLIST = new Set([
  "price_1RuOpKQQU5vuhlNjipfFBsR0", // ONE_TIME_STARTER
  "price_1S4Y9JQQU5vuhlNjB7cBfmaW", // EXTRA_ONE_TIME
  "price_1S4XsVQQU5vuhlNjzdQzeySA", // PRO_MONTHLY
  "price_1S4Y6YQQU5vuhlNjeJFmshxX", // ELITE_ANNUAL
]);

const SUBSCRIPTION_PRICE_IDS = new Set([
  "price_1S4XsVQQU5vuhlNjzdQzeySA",
  "price_1S4Y6YQQU5vuhlNjeJFmshxX",
]);

const LEGACY_PLAN_MAP: Record<string, string> = {
  one: "price_1RuOpKQQU5vuhlNjipfFBsR0",
  extra: "price_1S4Y9JQQU5vuhlNjB7cBfmaW",
  pro_monthly: "price_1S4XsVQQU5vuhlNjzdQzeySA",
  elite_annual: "price_1S4Y6YQQU5vuhlNjeJFmshxX",
};

let stripeClient: Stripe | null = null;

function getStripe(): Stripe {
  if (stripeClient) return stripeClient;
  const secret = getStripeSecret();
  if (!secret) {
    throw Object.assign(new Error("stripe_config_missing"), { code: "stripe_config_missing" });
  }
  stripeClient = new Stripe(secret, { apiVersion: "2024-06-20" });
  return stripeClient;
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
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
    res.status(204).end();
    return { allowedOrigin, ended: true };
  }

  return { allowedOrigin, ended: false };
}

async function ensureStripeCustomer(stripe: Stripe, uid: string): Promise<string> {
  const docRef = db.doc(`users/${uid}/private/stripe`);
  const snap = await docRef.get();
  const data = snap.exists ? (snap.data() as Record<string, unknown>) : undefined;
  let customerId = typeof data?.customerId === "string" ? data.customerId : undefined;

  if (customerId) {
    try {
      await stripe.customers.update(customerId, { metadata: { uid } });
    } catch (err) {
      console.warn("stripe_customer_update_failed", { uid, customerId, error: (err as Error)?.message });
      customerId = undefined;
    }
  }

  if (!customerId) {
    const userRecord = await getAuth().getUser(uid);
    const email = userRecord.email;
    if (!email) {
      throw Object.assign(new Error("no_email"), { code: "no_email" });
    }
    const customer = await stripe.customers.create({
      email,
      metadata: { uid },
    });
    customerId = customer.id;
    await docRef.set(
      {
        customerId,
        email,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  } else {
    await docRef.set({ updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  }

  return customerId;
}

function resolvePriceId(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const payload = body as Record<string, unknown>;
  const direct = typeof payload.priceId === "string" ? payload.priceId.trim() : "";
  if (direct && PRICE_ALLOWLIST.has(direct)) {
    return direct;
  }
  const plan = typeof payload.plan === "string" ? payload.plan.trim().toLowerCase() : "";
  if (plan && LEGACY_PLAN_MAP[plan]) {
    return LEGACY_PLAN_MAP[plan];
  }
  return null;
}

function createErrorResponse(res: Response, status: number, error: string, code?: string): void {
  res.status(status).json({ error, code: code ?? error });
}

async function handleCreateCheckout(req: Request, res: Response) {
  const { allowedOrigin, ended } = applyCors(req, res);
  if (ended) return;

  const requestedOrigin = req.headers.origin as string | undefined;
  if (requestedOrigin && !allowedOrigin) {
    createErrorResponse(res, 403, "origin_not_allowed");
    return;
  }

  if (req.method !== "POST") {
    createErrorResponse(res, 405, "method_not_allowed");
    return;
  }

  let uid: string;
  try {
    uid = await requireAuth(req);
  } catch {
    createErrorResponse(res, 401, "auth_required");
    return;
  }

  const priceId = resolvePriceId(req.body);
  if (!priceId || !PRICE_ALLOWLIST.has(priceId)) {
    createErrorResponse(res, 400, "invalid_price");
    return;
  }

  let stripe: Stripe;
  try {
    stripe = getStripe();
  } catch (err) {
    const code = (err as { code?: string } | undefined)?.code;
    createErrorResponse(res, 500, "stripe_config_missing", code);
    return;
  }

  let customerId: string;
  try {
    customerId = await ensureStripeCustomer(stripe, uid);
  } catch (err) {
    const code = (err as { code?: string } | undefined)?.code;
    if (code === "no_email") {
      createErrorResponse(res, 400, "missing_email", code);
      return;
    }
    console.error("ensureStripeCustomer_failed", { uid, error: (err as Error)?.message });
    createErrorResponse(res, 500, "stripe_customer_error", code);
    return;
  }

  const origin = allowedOrigin || DEFAULT_RETURN_HOST;
  const mode: Stripe.Checkout.SessionCreateParams.Mode = SUBSCRIPTION_PRICE_IDS.has(priceId) ? "subscription" : "payment";

  try {
    const session = await stripe.checkout.sessions.create({
      mode,
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/settings?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/plans?canceled=1`,
      allow_promotion_codes: mode === "subscription",
      client_reference_id: uid,
      metadata: { uid, priceId },
      payment_intent_data: mode === "payment" ? { metadata: { uid, priceId } } : undefined,
      subscription_data: mode === "subscription" ? { metadata: { uid, priceId } } : undefined,
    });

    const url = session.url;
    if (!url) {
      createErrorResponse(res, 500, "stripe_session_missing");
      return;
    }

    res.json({ url });
  } catch (err) {
    console.error("createCheckout_failed", { uid, priceId, error: (err as Error)?.message });
    createErrorResponse(res, 500, "stripe_error");
  }
}

async function handleCustomerPortal(req: Request, res: Response) {
  const { allowedOrigin, ended } = applyCors(req, res);
  if (ended) return;

  const requestedOrigin = req.headers.origin as string | undefined;
  if (requestedOrigin && !allowedOrigin) {
    createErrorResponse(res, 403, "origin_not_allowed");
    return;
  }

  if (req.method !== "POST") {
    createErrorResponse(res, 405, "method_not_allowed");
    return;
  }

  let uid: string;
  try {
    uid = await requireAuth(req);
  } catch {
    createErrorResponse(res, 401, "auth_required");
    return;
  }

  let stripe: Stripe;
  try {
    stripe = getStripe();
  } catch (err) {
    const code = (err as { code?: string } | undefined)?.code;
    createErrorResponse(res, 500, "stripe_config_missing", code);
    return;
  }

  let customerId: string;
  try {
    customerId = await ensureStripeCustomer(stripe, uid);
  } catch (err) {
    const code = (err as { code?: string } | undefined)?.code;
    if (code === "no_email") {
      createErrorResponse(res, 404, "no_customer", code);
      return;
    }
    console.error("ensureStripeCustomer_failed", { uid, error: (err as Error)?.message });
    createErrorResponse(res, 500, "stripe_customer_error", code);
    return;
  }

  const origin = allowedOrigin || DEFAULT_RETURN_HOST;

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/settings`,
    });

    if (!session.url) {
      createErrorResponse(res, 500, "stripe_portal_missing");
      return;
    }

    res.json({ url: session.url });
  } catch (err) {
    console.error("createCustomerPortal_failed", { uid, error: (err as Error)?.message });
    createErrorResponse(res, 500, "stripe_error");
  }
}

export const createCheckout = onRequest({ region: "us-central1" }, (req, res) => {
  void handleCreateCheckout(req as Request, res as Response);
});

export const createCustomerPortal = onRequest({ region: "us-central1" }, (req, res) => {
  void handleCustomerPortal(req as Request, res as Response);
});

export { LEGACY_PLAN_MAP };
