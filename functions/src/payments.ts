import type { Request, Response } from "express";
import { onRequest } from "firebase-functions/v2/https";
import { withCors } from "./middleware/cors.js";
import { requireAuth, verifyAppCheckSoft, publicBaseUrl } from "./http.js";
import { hasStripe, assertStripeConfigured, getStripeSecret, getStripeSigningSecret } from "./lib/env.js";

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

  const body = (req.body ?? {}) as { priceId?: string; mode?: "payment" | "subscription" };
  const priceId = typeof body.priceId === "string" ? body.priceId : undefined;
  const mode = body.mode === "subscription" ? "subscription" : "payment";

  // Allowlist price IDs
  const ALLOWED = new Set<string>([
    "price_1RuOpKQQU5vuhlNjipfFBsR0", // One-time scan $9.99
    "price_1S4Y9JQQU5vuhlNjB7cBfmaW", // Extra one-time $9.99
    "price_1S4XsVQQU5vuhlNjzdQzeySA", // Monthly subscription
    "price_1S4Y6YQQU5vuhlNjeJFmshxX", // Annual subscription
  ]);
  if (!priceId || !ALLOWED.has(priceId)) {
    return res.status(400).send("bad_price");
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

export const createCheckout = onRequest(
  { invoker: "public" },
  withCors(async (req, res) => {
    if (req.method !== "POST") {
      methodNotAllowed(res as Response);
      return;
    }
    try {
      await verifyAppCheckSoft(req as unknown as Request);
      await createCheckoutHandler(req as unknown as Request, res as Response);
    } catch (error: any) {
      if (!res.headersSent) {
        res.status(500).json({ error: error?.message ?? "server_error" });
      }
    }
  })
);

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

