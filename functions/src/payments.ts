import { onRequest } from "firebase-functions/v2/https";
import type { Request, Response } from "express";
import { getAuth } from "firebase-admin/auth";

import { addCredits, setSubscriptionStatus } from "./credits.js";
import { FieldValue, Timestamp, getFirestore } from "./firebase.js";
import { withCors } from "./middleware/cors.js";
import { appCheckSoft } from "./middleware/appCheck.js";
import { requireAuth, publicBaseUrl } from "./http.js";
import {
  assertStripeConfigured,
  getStripeSecret,
  getStripeSigningSecret,
  hasStripe,
} from "./lib/env.js";

const db = getFirestore();
const DEFAULT_ORIGIN = "https://mybodyscanapp.com";
const CHECKOUT_OPTIONS = { region: "us-central1", invoker: "public", concurrency: 10 } as const;
const PORTAL_OPTIONS = { region: "us-central1", invoker: "public" } as const;
const WEBHOOK_OPTIONS = { region: "us-central1", rawBody: true } as const;

const PLAN_CONFIG: Record<string, { priceId: string; mode: "payment" | "subscription" }> = {
  single: { priceId: "price_single_scan", mode: "payment" },
  monthly: { priceId: "price_monthly_intro", mode: "subscription" },
  yearly: { priceId: "price_annual", mode: "subscription" },
  extra: { priceId: "price_extra_scan", mode: "payment" },
};

type StripeClient = {
  stripe: import("stripe").Stripe;
  signingSecret: string;
  origin: string;
};

type Handler = (req: Request, res: Response) => Promise<void>;

async function runAppCheckSoft(req: Request, res: Response): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let allowed = false;
    let settled = false;
    const emitter: any = res;
    const cleanup = () => {
      if (settled) return;
      settled = true;
      emitter.off?.("finish", cleanup as any);
      emitter.off?.("close", cleanup as any);
      resolve(allowed && !res.headersSent);
    };
    emitter.once?.("finish", cleanup as any);
    emitter.once?.("close", cleanup as any);
    appCheckSoft(req, res, () => {
      allowed = true;
      cleanup();
    });
    if (res.headersSent) {
      cleanup();
    }
  });
}

async function withSoftAppCheck(req: Request, res: Response, handler: Handler): Promise<void> {
  const allowed = await runAppCheckSoft(req, res);
  if (!allowed) {
    return;
  }
  await handler(req, res);
}

async function loadStripeClient(req: Request, res: Response): Promise<StripeClient | null> {
  const secret = getStripeSecret();
  const signingSecret = getStripeSigningSecret();
  if (!secret || !signingSecret) {
    console.warn("payments_missing_secrets", { path: req.path });
    res.status(501).json({ error: "payments_disabled" });
    return null;
  }

  try {
    const { default: Stripe } = await import("stripe");
    const stripe = new Stripe(secret, { apiVersion: "2024-06-20" });
    const origin = publicBaseUrl(req) || DEFAULT_ORIGIN;
    return { stripe, signingSecret, origin };
  } catch (error) {
    console.error("stripe_init_failed", { message: (error as Error)?.message });
    res.status(500).json({ error: "stripe_init_failed" });
    return null;
  }
}

function parsePlan(value: unknown): { plan: string } | null {
  const raw = typeof value === "string" ? value.trim() : Array.isArray(value) ? value[0] : null;
  if (!raw || typeof raw !== "string") {
    return null;
  }
  if (!PLAN_CONFIG[raw]) {
    return null;
  }
  return { plan: raw };
}

async function handleCreateCheckout(req: Request, res: Response): Promise<void> {
  try {
    assertStripeConfigured();
  } catch (error) {
    res.status(501).json({ error: "payments_disabled" });
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  let uid: string;
  try {
    uid = await requireAuth(req);
  } catch (error: any) {
    const code = error?.code as string | undefined;
    const status = code === "unauthenticated" ? 401 : code === "permission-denied" ? 403 : 401;
    res.status(status).json({ error: error?.message || "unauthenticated", code });
    return;
  }

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const planPayload = parsePlan((body as any).plan ?? req.query?.plan);
  if (!planPayload) {
    res.status(400).json({ error: "invalid_plan" });
    return;
  }

  const runtime = await loadStripeClient(req, res);
  if (!runtime) {
    return;
  }

  const { stripe, origin } = runtime;
  const config = PLAN_CONFIG[planPayload.plan];

  try {
    const session = await stripe.checkout.sessions.create({
      mode: config.mode,
      line_items: [{ price: config.priceId, quantity: 1 }],
      success_url: `${origin}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/plans?canceled=1`,
      client_reference_id: uid,
      metadata: { uid, priceId: config.priceId, plan: planPayload.plan },
    });
    res.json({ url: session.url ?? null });
  } catch (error: any) {
    console.error("stripe_checkout_error", { message: error?.message, plan: planPayload.plan });
    res.status(502).json({ error: "checkout_failed" });
  }
}

async function handleCustomerPortal(req: Request, res: Response): Promise<void> {
  try {
    assertStripeConfigured();
  } catch (error) {
    res.status(501).json({ error: "payments_disabled" });
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  let uid: string;
  try {
    uid = await requireAuth(req);
  } catch (error: any) {
    const code = error?.code as string | undefined;
    const status = code === "unauthenticated" ? 401 : code === "permission-denied" ? 403 : 401;
    res.status(status).json({ error: error?.message || "unauthenticated", code });
    return;
  }

  const runtime = await loadStripeClient(req, res);
  if (!runtime) {
    return;
  }

  const { stripe, origin } = runtime;

  try {
    const user = await getAuth().getUser(uid);
    if (!user.email) {
      res.status(400).json({ error: "email_required" });
      return;
    }
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    if (!customers.data.length) {
      res.status(404).json({ error: "customer_not_found" });
      return;
    }
    const session = await stripe.billingPortal.sessions.create({
      customer: customers.data[0].id,
      return_url: `${origin}/plans`,
    });
    res.json({ url: session.url });
  } catch (error: any) {
    console.error("stripe_portal_error", { message: error?.message });
    res.status(502).json({ error: "portal_failed" });
  }
}

async function handleStripeWebhook(req: Request, res: Response): Promise<void> {
  try {
    assertStripeConfigured();
  } catch (error) {
    res.status(501).json({ error: "payments_disabled" });
    return;
  }
  if (req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }

  const runtime = await loadStripeClient(req, res);
  if (!runtime) {
    return;
  }

  const signature = req.header("Stripe-Signature");
  if (!signature) {
    res.status(400).send("Missing signature");
    return;
  }

  const rawBody = (req as any).rawBody as Buffer | undefined;
  if (!rawBody) {
    res.status(400).send("Missing raw body");
    return;
  }

  const { stripe, signingSecret } = runtime;
  let event: import("stripe").Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, signingSecret);
  } catch (error: any) {
    console.error("stripe_webhook_signature_error", { message: error?.message });
    res.status(400).send(`Webhook Error: ${error.message}`);
    return;
  }

  const eventRef = db.collection("stripe_events").doc(event.id);
  const expiresAt = Timestamp.fromDate(new Date(Date.now() + 1000 * 60 * 60 * 24 * 30));

  const shouldProcess = await db.runTransaction(async (tx) => {
    const existing = await tx.get(eventRef);
    if (existing.exists) {
      return false;
    }
    tx.set(eventRef, {
      type: event.type,
      receivedAt: FieldValue.serverTimestamp(),
      expiresAt,
    });
    return true;
  });

  if (!shouldProcess) {
    res.status(200).send("ok");
    return;
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as import("stripe").Stripe.Checkout.Session;
        const uid = (session.metadata?.uid as string) || null;
        const priceId = (session.metadata?.priceId as string) || null;
        if (uid && priceId) {
          await addCredits(uid, 1, `Checkout ${priceId}`, 12);
        }
        break;
      }
      case "invoice.payment_succeeded": {
        const invoice = event.data.object as import("stripe").Stripe.Invoice;
        const uid = (invoice.metadata?.uid as string) || null;
        if (uid) {
          const lines = Array.isArray(invoice.lines?.data) ? invoice.lines.data : [];
          const isMonthly = lines.some((line) => line.price?.recurring?.interval === "month");
          const isAnnual = lines.some((line) => line.price?.recurring?.interval === "year");
          if (isMonthly) {
            await addCredits(uid, 3, "Monthly subscription", 12);
          }
          if (isAnnual) {
            await addCredits(uid, 36, "Annual subscription (3/mo x 12)", 12);
          }
          await setSubscriptionStatus(
            uid,
            "active",
            (invoice.lines.data[0]?.price?.id as string) || null,
            invoice.lines.data[0]?.period?.end || null
          );
        }
        break;
      }
      case "customer.subscription.deleted": {
        const subscription = event.data.object as import("stripe").Stripe.Subscription;
        const uid = (subscription.metadata?.uid as string) || null;
        if (uid) {
          await setSubscriptionStatus(uid, "canceled", null, null);
        }
        break;
      }
      default: {
        console.warn("stripe_webhook_ignored_event", { type: event.type, id: event.id });
        break;
      }
    }

    await eventRef.set({ processedAt: FieldValue.serverTimestamp() }, { merge: true });
    res.status(200).send("ok");
  } catch (error: any) {
    console.error("stripe_webhook_handler_error", { message: error?.message });
    await eventRef.set(
      { error: error?.message || String(error), processedAt: FieldValue.serverTimestamp() },
      { merge: true }
    );
    res.status(500).send("Handler error");
  }
}

function createDisabledHandler(options: Parameters<typeof onRequest>[0]) {
  return onRequest(options, async (req: Request, res: Response) => {
    await withSoftAppCheck(req, res, async () => {
      res.status(501).json({ error: "payments_disabled" });
    });
  });
}

let createCheckoutExport: ReturnType<typeof onRequest>;
let createCustomerPortalExport: ReturnType<typeof onRequest>;
let stripeWebhookExport: ReturnType<typeof onRequest>;

if (!hasStripe()) {
  createCheckoutExport = createDisabledHandler(CHECKOUT_OPTIONS);
  createCustomerPortalExport = createDisabledHandler(PORTAL_OPTIONS);
  stripeWebhookExport = onRequest(WEBHOOK_OPTIONS, async (_req: Request, res: Response) => {
    res.status(501).json({ error: "payments_disabled" });
  });
} else {
  createCheckoutExport = onRequest(CHECKOUT_OPTIONS, withCors((req, res) => withSoftAppCheck(req, res, handleCreateCheckout)));
  createCustomerPortalExport = onRequest(PORTAL_OPTIONS, withCors((req, res) => withSoftAppCheck(req, res, handleCustomerPortal)));
  stripeWebhookExport = onRequest(WEBHOOK_OPTIONS, (req, res) => handleStripeWebhook(req, res));
}

export const createCheckout = createCheckoutExport;
export const createCustomerPortal = createCustomerPortalExport;
export const stripeWebhook = stripeWebhookExport;
