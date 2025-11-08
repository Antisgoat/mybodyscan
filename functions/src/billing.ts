import expressModule from "express";
import type { Request, Response } from "express";
import type Stripe from "stripe";
import { getAuth } from "./firebase.js";
import { allowCorsAndOptionalAppCheck, publicBaseUrl, requireAuthWithClaims } from "./http.js";
import { getStripe } from "./stripe/common.js";

const stripeConfigured = Boolean(process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET);

function resolveStripe(): Stripe | null {
  try {
    return getStripe();
  } catch {
    return null;
  }
}

const express = expressModule as any;

export const hasStripe = stripeConfigured;

const PRICE_ONE = process.env.PRICE_ONE || process.env.VITE_PRICE_ONE || "";
const PRICE_MONTHLY = process.env.PRICE_MONTHLY || process.env.VITE_PRICE_MONTHLY || "";
const PRICE_YEARLY = process.env.PRICE_YEARLY || process.env.VITE_PRICE_YEARLY || "";
const PRICE_EXTRA = process.env.PRICE_EXTRA || process.env.VITE_PRICE_EXTRA || "";
const PROMO_CODE = process.env.STRIPE_MONTHLY_PROMO_CODE || "";
const BASE_URL = process.env.BASE_URL || process.env.APP_BASE_URL || process.env.VITE_APP_BASE_URL || "https://mybodyscanapp.com";

type PriceConfig = {
  id: string;
  plan: "one" | "monthly" | "yearly" | "extra";
  mode: "payment" | "subscription";
};

const priceConfigs: PriceConfig[] = [
  PRICE_ONE
    ? { id: PRICE_ONE, plan: "one", mode: "payment" }
    : null,
  PRICE_MONTHLY
    ? { id: PRICE_MONTHLY, plan: "monthly", mode: "subscription" }
    : null,
  PRICE_YEARLY
    ? { id: PRICE_YEARLY, plan: "yearly", mode: "subscription" }
    : null,
  PRICE_EXTRA
    ? { id: PRICE_EXTRA, plan: "extra", mode: "payment" }
    : null,
].filter((config): config is PriceConfig => Boolean(config?.id));

const allowedPrices = new Set(priceConfigs.map((config) => config.id));

function resolvePriceConfig(priceId: string): PriceConfig | null {
  return priceConfigs.find((config) => config.id === priceId) ?? null;
}

async function ensureCustomer(stripe: Stripe, uid: string, email?: string | null) {
  const query = `metadata['uid']:'${uid}'`;
  const existing = await stripe.customers.search({ query, limit: 1 });
  let customer = existing.data[0];
  if (!customer) {
    customer = await stripe.customers.create({ metadata: { uid }, email: email || undefined });
  } else {
    const metadata = customer.metadata || {};
    if (metadata.uid !== uid) {
      metadata.uid = uid;
    }
    const needsEmail = email && customer.email !== email;
    if (needsEmail || metadata.uid !== customer.metadata?.uid) {
      await stripe.customers.update(customer.id, { metadata, email: needsEmail ? email : customer.email || undefined });
    }
  }
  return customer;
}

function resolvePriceMode(priceId: string): "payment" | "subscription" {
  if (priceId === PRICE_ONE) return "payment";
  if (priceId === PRICE_MONTHLY || priceId === PRICE_YEARLY) return "subscription";
  return "payment";
}

function formatError(error: any) {
  const status = typeof error?.statusCode === "number" ? error.statusCode : undefined;
  const type = error?.type || error?.raw?.type;
  const code = error?.code || error?.raw?.code;
  return { status, type, code, message: error?.message || "checkout_failed" };
}

async function hasActiveSubscription(stripe: Stripe, customerId: string): Promise<boolean> {
  const subs = await stripe.subscriptions.list({ customer: customerId, status: "active", limit: 1 });
  return subs.data.length > 0;
}

export const billingRouter = express.Router();

billingRouter.use(allowCorsAndOptionalAppCheck);
billingRouter.use(express.json());

billingRouter.post("/create-checkout-session", async (req: Request, res: Response) => {
  const stripe = resolveStripe();
  if (!stripe) {
    res.status(501).json({ error: "payments_disabled" });
    return;
  }
  try {
    const { priceId, mode } = req.body ?? {};
    const normalizedPrice = typeof priceId === "string" ? priceId.trim() : "";
    if (!normalizedPrice || !allowedPrices.has(normalizedPrice)) {
      res.status(400).json({ error: "invalid_price" });
      return;
    }

    const priceConfig = resolvePriceConfig(normalizedPrice);
    if (!priceConfig) {
      res.status(400).json({ error: "unconfigured_price" });
      return;
    }

    const { uid, claims } = await requireAuthWithClaims(req);
    const emailClaim = typeof claims?.email === "string" ? claims.email : undefined;
    const auth = getAuth();
    let email = emailClaim;
    if (!email) {
      try {
        const record = await auth.getUser(uid);
        email = record.email || undefined;
      } catch {
        email = undefined;
      }
    }

    const customer = await ensureCustomer(stripe, uid, email);

    const inferredMode =
      mode === "subscription" || mode === "payment" ? mode : priceConfig.mode ?? resolvePriceMode(normalizedPrice);
    const params: Stripe.Checkout.SessionCreateParams = {
      mode: inferredMode,
      success_url: `${BASE_URL.replace(/\/$/, "")}/plans?success=1`,
      cancel_url: `${BASE_URL.replace(/\/$/, "")}/plans?canceled=1`,
      line_items: [{ price: normalizedPrice, quantity: 1 }],
      customer: customer.id,
      allow_promotion_codes: false,
      metadata: {
        uid,
        email: email || "",
        priceId: normalizedPrice,
        plan: priceConfig.plan,
      },
    };

    if (inferredMode === "subscription" && normalizedPrice === PRICE_MONTHLY && PROMO_CODE) {
      const active = await hasActiveSubscription(stripe, customer.id);
      if (!active) {
        params.discounts = [{ promotion_code: PROMO_CODE }];
      }
    }

    const session = await stripe.checkout.sessions.create(params);
    res.json({ sessionId: session.id });
  } catch (error) {
    const info = formatError(error);
    console.error("create_checkout_session_error", info);
    const status = info.status && info.status >= 400 && info.status < 600 ? info.status : 400;
    res.status(status).json({ error: info.message, code: info.code || null });
  }
});

async function handlePortal(req: Request, res: Response) {
  const stripe = resolveStripe();
  if (!stripe) {
    res.status(501).json({ error: "payments_disabled" });
    return;
  }
  try {
    const { uid, claims } = await requireAuthWithClaims(req);
    const emailClaim = typeof claims?.email === "string" ? claims.email : undefined;
    const auth = getAuth();
    let email = emailClaim;
    if (!email) {
      try {
        const record = await auth.getUser(uid);
        email = record.email || undefined;
      } catch {
        email = undefined;
      }
    }
    const customer = await ensureCustomer(stripe, uid, email);
    const portal = await stripe.billingPortal.sessions.create({
      customer: customer.id,
      return_url: `${publicBaseUrl(req)}/plans`,
    });
    res.json({ url: portal.url });
  } catch (error) {
    const info = formatError(error);
    console.error("billing_portal_error", info);
    const status = info.status && info.status >= 400 && info.status < 600 ? info.status : 400;
    res.status(status).json({ error: info.message, code: info.code || null });
  }
}

billingRouter.post("/portal", handlePortal);
billingRouter.post("/customer-portal", handlePortal);
