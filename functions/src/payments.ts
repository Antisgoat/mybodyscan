import type { Request, Response } from "express";
import { onRequest } from "firebase-functions/v2/https";
import { hasStripe, assertStripeConfigured, getStripeSigningSecret } from "./lib/env.js";
import { getStripeSecret } from "./stripe/common.js";

export async function stripeWebhookHandler(req: Request, res: Response) {
  if (!hasStripe()) return res.status(501).json({ error: "payments_disabled" });
  try { assertStripeConfigured(); } catch { return res.status(501).json({ error: "payments_disabled" }); }

  const { default: Stripe } = await import("stripe");
  const signingSecret = getStripeSigningSecret() as string;
  const stripe = new Stripe(getStripeSecret(), { apiVersion: "2023-10-16" as any });

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
