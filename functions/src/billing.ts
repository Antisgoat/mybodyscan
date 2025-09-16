import { Timestamp } from "firebase-admin/firestore";
import Stripe from "stripe";
import { admin, db, functions, getSecret } from "./admin";
import { requireCallableAuth, requireUserFromRequest } from "./auth";
import { consumeCredit, getCurrentCredits, grantCredits, refreshCreditsSummary } from "./credits";
import { EntitlementResponse } from "./types";
import * as crypto from "node:crypto";

const stripeSecret = getSecret("STRIPE_SECRET_KEY");
const stripeWebhookSecret = getSecret("STRIPE_WEBHOOK_SECRET");
const appBaseUrl = getSecret("APP_BASE_URL");

function getStripe(): Stripe {
  if (!stripeSecret) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Stripe secret not configured"
    );
  }
  return new Stripe(stripeSecret, { apiVersion: "2024-06-20" as Stripe.LatestApiVersion });
}

async function lookupPricing(priceId: string): Promise<{ plan?: string; credits?: number; credit_expiry_days?: number }> {
  const snap = await db.doc(`pricing/${priceId}`).get();
  if (!snap.exists) return {};
  const data = snap.data() as any;
  return {
    plan: data.plan as string | undefined,
    credits: data.credits as number | undefined,
    credit_expiry_days: data.credit_expiry_days as number | undefined,
  };
}

function determinePlan(priceId: string, explicit?: string | null): "monthly" | "annual" | undefined {
  if (explicit === "monthly" || explicit === "annual") return explicit;
  if (priceId.includes("month")) return "monthly";
  if (priceId.includes("year") || priceId.includes("annual")) return "annual";
  return undefined;
}

export const entitlement = functions.https.onCall(async (data, context) => {
  const requestId = crypto.randomUUID();
  const uid = requireCallableAuth(context, requestId);
  await refreshCreditsSummary(uid);
  const credits = await getCurrentCredits(uid);
  const subSnap = await db.doc(`users/${uid}/private/subStatus`).get();
  const subData = subSnap.data() as any | undefined;
  const response: EntitlementResponse = {
    subscribed: false,
    credits,
  };
  if (subData) {
    const status = (subData.status as string | undefined) ?? "none";
    const plan = (subData.plan as string | undefined) ?? undefined;
    const pending = subData.iap_receipt_pending as boolean | undefined;
    response.plan = plan as any;
    response.iap_receipt_pending = pending ?? false;
    response.subscribed = status === "active" || status === "trialing";
  }
  functions.logger.info("entitlement", { requestId, uid, subscribed: response.subscribed, credits });
  return response;
});

export const useCredit = functions.https.onRequest(async (req, res) => {
  const requestId = crypto.randomUUID();
  if (req.method !== "POST") {
    res.status(405).set("Allow", "POST").json({ error: "Method not allowed" });
    return;
  }
  try {
    const uid = await requireUserFromRequest(req, requestId);
    const remaining = await consumeCredit(uid);
    if (remaining === null) {
      res.status(402).json({ error: "No credits" });
      return;
    }
    await refreshCreditsSummary(uid);
    functions.logger.info("credit_consumed", { requestId, uid, remaining });
    const body = { ok: true, remaining };
    if (req.body && typeof req.body === "object" && "data" in req.body) {
      res.json({ result: body });
    } else {
      res.json(body);
    }
  } catch (err: any) {
    const code = err instanceof functions.https.HttpsError ? err.code : "internal";
    const status = code === "unauthenticated" ? 401 : 500;
    functions.logger.error("use_credit_error", { requestId, error: err });
    if (req.body && typeof req.body === "object" && "data" in req.body) {
      res.status(status).json({ error: { message: err?.message ?? "Failed" } });
    } else {
      res.status(status).json({ error: err?.message ?? "Failed" });
    }
  }
});

export const createCheckoutSession = functions.https.onRequest(async (req, res) => {
  const requestId = crypto.randomUUID();
  if (req.method !== "POST") {
    res.status(405).set("Allow", "POST").json({ error: "Method not allowed" });
    return;
  }
  try {
    const uid = await requireUserFromRequest(req, requestId);
    const stripe = getStripe();
    const { priceId, mode, successUrl, cancelUrl, plan } = req.body || {};
    if (!priceId || !mode) {
      res.status(400).json({ error: "Missing priceId or mode" });
      return;
    }
    if (mode !== "payment" && mode !== "subscription") {
      res.status(400).json({ error: "Invalid mode" });
      return;
    }
    const pricing = await lookupPricing(priceId);
    const planType = determinePlan(priceId, plan ?? pricing.plan);
    const resolvedSuccess = successUrl || `${appBaseUrl ?? req.protocol + "://" + req.get("host")}/checkout/success`;
    const resolvedCancel = cancelUrl || `${appBaseUrl ?? req.protocol + "://" + req.get("host")}/checkout/canceled`;
    const session = await stripe.checkout.sessions.create({
      mode,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: resolvedSuccess,
      cancel_url: resolvedCancel,
      metadata: {
        uid,
        plan: planType ?? "unknown",
        price_id: priceId,
      },
      automatic_tax: { enabled: true },
      customer_email: (await admin.auth().getUser(uid)).email ?? undefined,
    });
    functions.logger.info("checkout_session_created", { requestId, uid, priceId, mode });
    res.json({ url: session.url });
  } catch (err: any) {
    functions.logger.error("checkout_session_error", { requestId, error: err });
    if (err instanceof functions.https.HttpsError) {
      const status = err.code === "unauthenticated" ? 401 : err.code === "permission-denied" ? 403 : 400;
      res.status(status).json({ error: err.message });
      return;
    }
    res.status(500).json({ error: err?.message || "Failed to create session" });
  }
});

async function recordStripeEvent(event: Stripe.Event): Promise<boolean> {
  const ref = db.doc(`stripe_events/${event.id}`);
  try {
    await ref.create({
      id: event.id,
      type: event.type,
      created: Timestamp.now(),
    });
    return true;
  } catch (err: any) {
    if (err?.code === 6 || err?.code === "ALREADY_EXISTS") {
      return false;
    }
    throw err;
  }
}

async function applySubscriptionUpdate(params: {
  uid: string;
  status: string;
  plan?: string;
  currentPeriodEnd?: number | null;
  priceId?: string | null;
  customerId?: string | null;
}) {
  const { uid, status, plan, currentPeriodEnd, priceId, customerId } = params;
  const subDoc = db.doc(`users/${uid}/private/subStatus`);
  const payload: Record<string, unknown> = {
    status,
    plan: plan ?? null,
    period_end: currentPeriodEnd ? Timestamp.fromMillis(currentPeriodEnd * 1000) : null,
    priceId: priceId ?? null,
    customerId: customerId ?? null,
    updatedAt: Timestamp.now(),
  };
  await subDoc.set(payload, { merge: true });
}

async function maybeGrantCredits(uid: string, priceId: string | undefined | null, context: string) {
  if (!priceId) return;
  const pricing = await lookupPricing(priceId);
  if (!pricing.credits || !pricing.credit_expiry_days) {
    return;
  }
  await grantCredits(uid, pricing.credits, pricing.credit_expiry_days, priceId, context);
  await refreshCreditsSummary(uid);
}

export const stripeWebhook = functions.https.onRequest(async (req, res) => {
  const requestId = crypto.randomUUID();
  if (req.method !== "POST") {
    res.status(405).set("Allow", "POST").end();
    return;
  }
  if (!stripeSecret || !stripeWebhookSecret) {
    functions.logger.error("stripe_webhook_missing_secret", { requestId });
    res.status(500).end();
    return;
  }
  const stripe = getStripe();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.rawBody, req.headers["stripe-signature"] as string, stripeWebhookSecret);
  } catch (err: any) {
    functions.logger.warn("stripe_webhook_signature_failed", { requestId, error: err });
    res.status(400).send(`Webhook Error: ${err.message}`);
    return;
  }
  const shouldProcess = await recordStripeEvent(event);
  if (!shouldProcess) {
    functions.logger.info("stripe_event_duplicate", { requestId, eventId: event.id });
    res.json({ ok: true });
    return;
  }
  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const uid = session.metadata?.uid;
        if (!uid) {
          functions.logger.warn("checkout_completed_missing_uid", { requestId, eventId: event.id });
          break;
        }
        let periodEnd: number | undefined;
        let priceId: string | undefined;
        if (session.subscription) {
          const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
          periodEnd = subscription.current_period_end;
          priceId = (subscription.items.data[0]?.price?.id) || undefined;
          await applySubscriptionUpdate({
            uid,
            status: subscription.status,
            plan: determinePlan(priceId ?? "", session.metadata?.plan),
            currentPeriodEnd: periodEnd ?? null,
            priceId: priceId ?? null,
            customerId: subscription.customer as string,
          });
          if (subscription.status === "active" || subscription.status === "trialing") {
            await maybeGrantCredits(uid, priceId, `session:${session.id}`);
          }
        } else {
          await applySubscriptionUpdate({
            uid,
            status: "active",
            plan: determinePlan(session.metadata?.price_id ?? "", session.metadata?.plan),
            currentPeriodEnd: null,
            priceId: session.metadata?.price_id ?? null,
            customerId: session.customer?.toString() ?? null,
          });
          await maybeGrantCredits(uid, session.metadata?.price_id ?? null, `session:${session.id}`);
        }
        break;
      }
      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        const uid = (invoice.metadata?.uid || invoice.subscription_details?.metadata?.uid) as string | undefined;
        if (!uid && invoice.customer) {
          const customer = await stripe.customers.retrieve(invoice.customer as string);
          if (customer && !("deleted" in customer)) {
            const userId = customer.metadata?.uid as string | undefined;
            if (userId) {
              invoice.metadata = invoice.metadata || {};
              invoice.metadata.uid = userId;
            }
          }
        }
        const finalUid = (invoice.metadata?.uid as string | undefined) ?? undefined;
        if (finalUid) {
          const priceId = invoice.lines.data[0]?.price?.id ?? undefined;
          const periodEnd = invoice.lines.data[0]?.period?.end ?? undefined;
          await applySubscriptionUpdate({
            uid: finalUid,
            status: "active",
            plan: determinePlan(priceId ?? "", invoice.metadata?.plan),
            currentPeriodEnd: periodEnd ?? null,
            priceId: priceId ?? null,
            customerId: invoice.customer?.toString() ?? null,
          });
          await maybeGrantCredits(finalUid, priceId ?? null, `invoice:${invoice.id}`);
        }
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.created":
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const uid = subscription.metadata?.uid as string | undefined;
        if (uid) {
          await applySubscriptionUpdate({
            uid,
            status: event.type === "customer.subscription.deleted" ? "canceled" : subscription.status,
            plan: determinePlan(subscription.items.data[0]?.price?.id ?? "", subscription.metadata?.plan),
            currentPeriodEnd: subscription.current_period_end ?? null,
            priceId: subscription.items.data[0]?.price?.id ?? null,
            customerId: subscription.customer?.toString() ?? null,
          });
        }
        break;
      }
      default:
        functions.logger.info("stripe_event_ignored", { requestId, type: event.type });
    }
    res.json({ received: true });
  } catch (err: any) {
    functions.logger.error("stripe_webhook_error", { requestId, error: err, eventType: event.type });
    res.status(500).json({ error: "Processing failed" });
  }
});
