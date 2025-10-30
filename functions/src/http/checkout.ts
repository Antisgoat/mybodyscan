import type { Request, Response } from "express";
import { onRequest } from "firebase-functions/v2/https";
import Stripe from "stripe";
import { publicBaseUrl, requireAuth } from "../http.js";
import { getAuth, getFirestore } from "../firebase.js";
import { getStripeSecret } from "../lib/env.js";

const ALLOWED_ORIGINS = [
  "https://mybodyscanapp.com",
  "https://www.mybodyscanapp.com",
  "https://mybodyscan-f3daf.web.app",
  "https://mybodyscan-f3daf.firebaseapp.com",
  "http://localhost",
  "http://localhost:5173",
  "http://127.0.0.1",
  "http://127.0.0.1:5173",
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

const PRICE_BY_PLAN: Record<string, string> = {
  one: "price_1RuOpKQQU5vuhlNjipfFBsR0",
  extra: "price_1S4Y9JQQU5vuhlNjB7cBfmaW",
  pro_monthly: "price_1S4XsVQQU5vuhlNjzdQzeySA",
  elite_annual: "price_1S4Y6YQQU5vuhlNjeJFmshxX",
};

const db = getFirestore();

async function ensureStripeCustomerForUid(uid: string): Promise<string | null> {
  const stripe = getStripe();
  const privRef = db.doc(`users/${uid}/private/stripe`);
  const snap = await privRef.get();
  const existingId = (snap.exists ? (snap.data() as any)?.customerId : null) as string | null;
  if (existingId) return existingId;

  const user = await getAuth().getUser(uid);
  const email = user.email || undefined;

  // Try lookup by email first
  if (email) {
    const matches = await stripe.customers.list({ email, limit: 1 });
    const found = matches.data?.[0]?.id;
    if (found) {
      await privRef.set({ customerId: found, updatedAt: new Date(), email }, { merge: true });
      // Ensure metadata
      try { await stripe.customers.update(found, { metadata: { uid } }); } catch {}
      return found;
    }
  }

  // Create new
  const created = await stripe.customers.create({ email, metadata: { uid } });
  await privRef.set({ customerId: created.id, updatedAt: new Date(), email: email || null }, { merge: true });
  return created.id;
}

export const createCheckout = onRequest({ region: "us-central1" }, (req, res) => {
  corsWrap(req as unknown as Request, res as unknown as Response, async () => {
    if (req.method !== "POST") {
      res.status(405).json({ error: "method_not_allowed", code: "method_not_allowed" });
      return;
    }
    let uid: string;
    try {
      uid = await requireAuth(req as unknown as Request);
    } catch {
      res.status(401).json({ error: "unauthenticated", code: "unauthenticated" });
      return;
    }
    const body = (req.body || {}) as { priceId?: string; plan?: string };
    const inputPriceId = typeof body.priceId === "string" ? body.priceId : (typeof body.plan === "string" ? PRICE_BY_PLAN[body.plan] : undefined);
    const priceId = inputPriceId;
    if (typeof priceId !== "string" || !PRICE_ALLOWLIST.has(priceId)) {
      res.status(400).json({ error: "invalid_price", code: "invalid_price" });
      return;
    }
    try {
      const stripe = getStripe();
      const customerId = await ensureStripeCustomerForUid(uid);
      const origin = publicBaseUrl(req as any);
      const mode = SUBSCRIPTION_PRICE_IDS.has(priceId) ? "subscription" : "payment";
      const session = await stripe.checkout.sessions.create({
        mode: mode as Stripe.Checkout.SessionCreateParams.Mode,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${origin}/settings?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/plans?canceled=1`,
        allow_promotion_codes: mode === "subscription",
        client_reference_id: uid,
        metadata: { uid, priceId },
        customer: customerId || undefined,
      });
      res.json({ url: session.url });
    } catch (e: any) {
      console.error("createCheckout_error", e?.message || e);
      res.status(500).json({ error: "server_error", code: "server_error", message: e?.message });
    }
  });
});

export const createCustomerPortal = onRequest({ region: "us-central1" }, (req, res) => {
  corsWrap(req as unknown as Request, res as unknown as Response, async () => {
    if (req.method !== "POST") {
      res.status(405).json({ error: "method_not_allowed", code: "method_not_allowed" });
      return;
    }
    let uid: string;
    try {
      uid = await requireAuth(req as unknown as Request);
    } catch {
      res.status(401).json({ error: "unauthenticated", code: "unauthenticated" });
      return;
    }
    try {
      const stripe = getStripe();
      // Prefer cached mapping in Firestore
      let customerId: string | null = (await (async () => {
        const snap = await db.doc(`users/${uid}/private/stripe`).get();
        return snap.exists ? ((snap.data() as any)?.customerId as string | null) : null;
      })());
      // Fallback via session or email lookup
      if (!customerId) {
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
      }
      if (!customerId) {
        const userRecord = await getAuth().getUser(uid);
        const email = userRecord.email || undefined;
        if (email) {
          const customers = await stripe.customers.list({ email, limit: 1 });
          customerId = customers.data[0]?.id ?? null;
        }
      }
      if (!customerId) {
        res.status(404).json({ error: "no_customer", code: "no_customer" });
        return;
      }
      // Cache mapping if found via fallback
      try {
        await db.doc(`users/${uid}/private/stripe`).set({ customerId, updatedAt: new Date() }, { merge: true });
      } catch {}
      const origin = publicBaseUrl(req as any);
      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${origin}/settings`,
      });
      res.json({ url: session.url });
    } catch (e: any) {
      console.error("createCustomerPortal_error", e?.message || e);
      res.status(500).json({ error: "server_error", code: "server_error", message: e?.message });
    }
  });
});
