import type { Request, Response } from "express";
import { hasStripe, assertStripeConfigured, getStripeSecret, getStripeSigningSecret } from "./lib/env.js";

export async function createCheckout(req: Request, res: Response) {
  if (!hasStripe()) return res.status(501).json({ error: "payments_disabled" });
  try { assertStripeConfigured(); } catch { return res.status(501).json({ error: "payments_disabled" }); }
  const { default: Stripe } = await import("stripe");
  const stripe = new Stripe(getStripeSecret() as string, { apiVersion: "2024-06-20" } as any);
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [{ price: req.body?.priceId, quantity: 1 }],
    success_url: `${req.headers.origin || "https://mybodyscanapp.com"}/?success=1`,
    cancel_url: `${req.headers.origin || "https://mybodyscanapp.com"}/?canceled=1`,
  });
  return res.json({ id: session.id, url: session.url });
}

export async function stripeWebhook(req: Request, res: Response) {
  if (!hasStripe()) return res.status(501).json({ error: "payments_disabled" });
  try { assertStripeConfigured(); } catch { return res.status(501).json({ error: "payments_disabled" }); }
  const { default: Stripe } = await import("stripe");
  try {
    const sig = req.headers["stripe-signature"] as string;
    const event = Stripe.webhooks.constructEvent((req as any).rawBody, sig, getStripeSigningSecret() as string);
    return res.json({ received: true, type: event.type });
  } catch (err: any) {
    return res.status(400).json({ error: "invalid_signature", message: err?.message });
  }
}
