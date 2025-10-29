import type { Request, Response } from "express";
import { onRequest } from "firebase-functions/v2/https";
import cors from "cors";
import { requireAuth, verifyAppCheckSoft, publicBaseUrl } from "./http.js";
import { hasStripe, assertStripeConfigured, getStripeSecret, getStripeSigningSecret } from "./lib/env.js";

const PRICE_ONE_TIME = "price_1RuOpKQQU5vuhlNjipfFBsR0"; // One-time scan $9.99
const PRICE_EXTRA = "price_1S4Y9JQQU5vuhlNjB7cBfmaW"; // Extra one-time $9.99
const PRICE_MONTHLY = "price_1S4XsVQQU5vuhlNjzdQzeySA"; // Monthly subscription
const PRICE_ANNUAL = "price_1S4Y6YQQU5vuhlNjeJFmshxX"; // Annual subscription

const ALLOWED = new Set<string>([PRICE_ONE_TIME, PRICE_EXTRA, PRICE_MONTHLY, PRICE_ANNUAL]);

const PLAN_MAP: Record<string, { priceId: string; mode: "payment" | "subscription" }> = {
  single: { priceId: PRICE_ONE_TIME, mode: "payment" },
  monthly: { priceId: PRICE_MONTHLY, mode: "subscription" },
  yearly: { priceId: PRICE_ANNUAL, mode: "subscription" },
  extra: { priceId: PRICE_EXTRA, mode: "payment" },
};

export async function createCheckoutHandler(req: Request, res: Response) {
  if (!hasStripe()) return res.status(501).json({ error: "payments_disabled" });
  try {
    assertStripeConfigured();
  } catch {
    return res.status(501).json({ error: "payments_disabled" });
  }

  // Require Firebase Auth (via Authorization header); cookie-based not used here
  let uid: string;
  try {
    uid = await requireAuth(req);
  } catch {
    return res.status(401).json({ error: "unauthenticated" });
  }

  const body = (req.body ?? {}) as {
    priceId?: unknown;
    mode?: unknown;
    plan?: unknown;
  };

  let priceId: string | undefined;
  let mode: "payment" | "subscription" | undefined;

  const bodyPrice = typeof body.priceId === "string" ? body.priceId : undefined;
  const bodyModeRaw = typeof body.mode === "string" ? body.mode : undefined;

  if (bodyPrice) {
    if (!ALLOWED.has(bodyPrice)) {
      res.status(400).send("bad_price");
      return;
    }
    if (bodyModeRaw && bodyModeRaw !== "payment" && bodyModeRaw !== "subscription") {
      res.status(400).send("bad_mode");
      return;
    }
    priceId = bodyPrice;
    mode = bodyModeRaw === "subscription" ? "subscription" : "payment";
  } else if (typeof body.plan === "string") {
    const planConfig = PLAN_MAP[body.plan];
    if (!planConfig) {
      res.status(400).send("bad_plan");
      return;
    }
    priceId = planConfig.priceId;
    mode = planConfig.mode;
  }

  if (!priceId || !ALLOWED.has(priceId)) {
    res.status(400).send("bad_price");
    return;
  }

  if (!mode) {
    res.status(400).send("bad_mode");
    return;
  }

  const { default: Stripe } = await import("stripe");
  const stripe = new Stripe(getStripeSecret() as string, { apiVersion: "2024-06-20" as any });

  const origin = publicBaseUrl(req);
  const session = await stripe.checkout.sessions.create({
    mode: mode as any,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${origin}/plans?success=1`,
    cancel_url: `${origin}/plans?canceled=1`,
    metadata: { uid, priceId },
  });
  return res.json({ url: session.url });
}

export async function stripeWebhookHandler(req: Request, res: Response) {
  if (!hasStripe()) return res.status(501).json({ error: "payments_disabled" });
  try { assertStripeConfigured(); } catch { return res.status(501).json({ error: "payments_disabled" }); }

  const { default: Stripe } = await import("stripe");
  const signingSecret = getStripeSigningSecret() as string;
  const stripe = new Stripe(getStripeSecret() as string, { apiVersion: "2023-10-16" as any });

  try {
    const sig = req.headers["stripe-signature"] as string;
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
    if (!rawBody) {
      return res.status(400).json({ error: "invalid_signature", message: "missing_raw_body" });
    }
    const event = Stripe.webhooks.constructEvent(rawBody, sig, signingSecret);
    return res.json({ received: true, type: event.type });
  } catch (err: any) {
    return res.status(400).json({ error: "invalid_signature", message: err?.message });
  }
}

function methodNotAllowed(res: Response) {
  res.status(405).json({ error: "method_not_allowed" });
}

const checkoutCors = cors({
  origin: [
    "https://mybodyscanapp.com",
    "https://www.mybodyscanapp.com",
    "https://mybodyscan-f3daf.web.app",
    "https://mybodyscan-f3daf.firebaseapp.com",
  ],
  credentials: true,
});

export const createCheckout = onRequest({ invoker: "public" }, async (req, res) => {
  await new Promise<void>((resolve) => {
    checkoutCors(req as unknown as Request, res as Response, (corsErr: unknown) => {
      if (corsErr) {
        console.error("createCheckout cors", corsErr);
        if (!res.headersSent) {
          res.status(500).send("server_error");
        }
        resolve();
        return;
      }

      if (req.method === "OPTIONS") {
        res.status(204).end();
        resolve();
        return;
      }

      if (req.method !== "POST") {
        methodNotAllowed(res as Response);
        resolve();
        return;
      }

      (async () => {
        try {
          await verifyAppCheckSoft(req as unknown as Request);
          await createCheckoutHandler(req as unknown as Request, res as Response);
        } catch (error) {
          console.error("createCheckout error", error);
          if (!res.headersSent) {
            res.status(500).send("server_error");
          }
        }
        resolve();
      })();
    });
  });
});

export const stripeWebhook = onRequest(
  { invoker: "public" },
  async (req, res) => {
    if (req.method !== "POST") {
      methodNotAllowed(res as Response);
      return;
    }
    try {
      await stripeWebhookHandler(req as unknown as Request, res as Response);
    } catch (error: any) {
      if (!res.headersSent) {
        res.status(500).json({ error: error?.message ?? "server_error" });
      }
    }
  }
);

