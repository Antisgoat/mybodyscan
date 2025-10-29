import type { Request, Response } from "express";
import { onRequest } from "firebase-functions/v2/https";
import Stripe from "stripe";
import { requireAuth } from "../http.js";
import { getAuth } from "../firebase.js";
import { getStripeSecret } from "../lib/env.js";

const ALLOWED_ORIGINS = [
  "https://mybodyscanapp.com",
  "https://www.mybodyscanapp.com",
  "https://mybodyscan-f3daf.web.app",
  "https://mybodyscan-f3daf.firebaseapp.com",
];

const PRICE_ALLOWLIST = new Set([
  "price_1RuOpKQQU5vuhlNjipfFBsR0",
  "price_1S4Y9JQQU5vuhlNjB7cBfmaW",
  "price_1S4XsVQQU5vuhlNjzdQzeySA",
  "price_1S4Y6YQQU5vuhlNjeJFmshxX",
]);

const SUBSCRIPTION_PRICE_IDS = new Set([
  "price_1S4XsVQQU5vuhlNjzdQzeySA",
  "price_1S4Y6YQQU5vuhlNjeJFmshxX",
]);

let stripeClient: Stripe | null = null;

function getStripe(): Stripe {
  if (stripeClient) return stripeClient;
  const secret = getStripeSecret();
  if (!secret) {
    throw new Error("stripe_not_configured");
  }
  stripeClient = new Stripe(secret, { apiVersion: "2024-06-20" });
  return stripeClient;
}

function corsWrap(req: Request, res: Response, next: () => void | Promise<void>) {
  const origin = req.headers.origin || "";
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
  res.setHeader("Vary", "Origin");
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
    res.status(204).end();
    return;
  }
  void next();
}

export const createCheckout = onRequest({ region: "us-central1" }, (req, res) => {
  corsWrap(req as unknown as Request, res as unknown as Response, async () => {
    if (req.method !== "POST") {
      res.status(405).json({ error: "method_not_allowed" });
      return;
    }
    let uid: string;
    try {
      uid = await requireAuth(req as unknown as Request);
    } catch {
      res.status(401).json({ error: "unauthenticated" });
      return;
    }
    const { priceId } = (req.body || {}) as { priceId?: string };
    if (typeof priceId !== "string" || !PRICE_ALLOWLIST.has(priceId)) {
      res.status(400).json({ error: "invalid_price" });
      return;
    }
    try {
      const stripe = getStripe();
      const mode = SUBSCRIPTION_PRICE_IDS.has(priceId) ? "subscription" : "payment";
      const session = await stripe.checkout.sessions.create({
        mode: mode as Stripe.Checkout.SessionCreateParams.Mode,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: "https://mybodyscanapp.com/Plans?status=success",
        cancel_url: "https://mybodyscanapp.com/Plans?status=cancel",
        allow_promotion_codes: mode === "subscription",
        client_reference_id: uid,
        metadata: { uid, priceId },
      });
      res.json({ url: session.url });
    } catch (e: any) {
      console.error("createCheckout_error", e?.message || e);
      res.status(500).json({ error: "server_error", message: e?.message });
    }
  });
});

export const createCustomerPortal = onRequest({ region: "us-central1" }, (req, res) => {
  corsWrap(req as unknown as Request, res as unknown as Response, async () => {
    if (req.method !== "POST") {
      res.status(405).json({ error: "method_not_allowed" });
      return;
    }
    let uid: string;
    try {
      uid = await requireAuth(req as unknown as Request);
    } catch {
      res.status(401).json({ error: "unauthenticated" });
      return;
    }
    try {
      const stripe = getStripe();
      let customerId: string | null = null;
      const { session_id } = (req.body || {}) as { session_id?: string };
      if (typeof session_id === "string" && session_id) {
        try {
          const checkoutSession = await stripe.checkout.sessions.retrieve(session_id);
          const sessionCustomer = checkoutSession.customer;
          if (typeof sessionCustomer === "string") {
            customerId = sessionCustomer;
          }
        } catch (err) {
          console.warn("portal_session_lookup_failed", session_id, err);
        }
      }
      if (!customerId) {
        const userRecord = await getAuth().getUser(uid);
        const email = userRecord.email;
        if (!email) {
          res.status(400).json({ error: "no_email" });
          return;
        }
        const customers = await stripe.customers.list({ email, limit: 1 });
        customerId = customers.data[0]?.id ?? null;
      }
      if (!customerId) {
        res.status(404).json({ error: "customer_not_found" });
        return;
      }
      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: "https://mybodyscanapp.com/Plans",
      });
      res.json({ url: session.url });
    } catch (e: any) {
      console.error("createCustomerPortal_error", e?.message || e);
      res.status(500).json({ error: "server_error", message: e?.message });
    }
  });
});
