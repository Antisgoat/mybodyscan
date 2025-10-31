import { onRequest, type HttpsOptions, type Request } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import type { Response } from "express";
import Stripe from "stripe";

import { addCredits, setSubscriptionStatus } from "./credits.js";
import { FieldValue, Timestamp, getFirestore } from "./firebase.js";
import { getStripeSecret, getWebhookSecret, stripeSecretParam, stripeWebhookSecretParam } from "./lib/config.js";
import { runUserOperation } from "./lib/ops.js";

const db = getFirestore();

const PRICE_CREDIT_MAP: Record<string, number> = {
  price_1RuOpKQQU5vuhlNjipfFBsR0: 1,
  price_1RuOr2QQU5vuhlNjcqTckCHL: 3,
  price_1RuOrkQQU5vuhlNj15ebWfNP: 5,
  price_1RuOtOQQU5vuhlNjmXnQSsYq: 3,
  price_1RuOw0QQU5vuhlNjA5NZ66qq: 36,
  price_1S4Y9JQQU5vuhlNjB7cBfmaW: 1,
  price_1S4XsVQQU5vuhlNjzdQzeySA: 3,
  price_1S4Y6YQQU5vuhlNjeJFmshxX: 36,
};

const SUBSCRIPTION_PRICE_IDS = new Set<string>([
  "price_1RuOtOQQU5vuhlNjmXnQSsYq",
  "price_1RuOw0QQU5vuhlNjA5NZ66qq",
  "price_1S4XsVQQU5vuhlNjzdQzeySA",
  "price_1S4Y6YQQU5vuhlNjeJFmshxX",
]);

const stripeWebhookOptions: HttpsOptions & { rawBody: true } = {
  region: "us-central1",
  cors: ["https://mybodyscanapp.com", "https://mybodyscan-f3daf.web.app"],
  maxInstances: 3,
  secrets: [stripeWebhookSecretParam, stripeSecretParam],
  rawBody: true,
};

export const stripeWebhook = onRequest(stripeWebhookOptions, async (req: Request, res: Response) => {
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    const signature = req.header("Stripe-Signature");
    if (!signature) {
      res.status(400).send("Missing signature");
      return;
    }

    const stripeSecret = getStripeSecret();
    const webhookSecret = getWebhookSecret();
    if (!stripeSecret || !webhookSecret) {
      const missing: string[] = [];
      if (!stripeSecret) missing.push("STRIPE_SECRET");
      if (!webhookSecret) missing.push("STRIPE_WEBHOOK");
      logger.error("stripe_config_missing", { service: "stripeWebhook", missing });
      res.status(500).send("Missing Stripe secrets");
      return;
    }

    const stripe = new Stripe(stripeSecret, { apiVersion: "2024-06-20" });

    const rawBody = (req as unknown as { rawBody?: Buffer }).rawBody;
    if (!rawBody) {
      logger.error("stripeWebhook_missing_raw_body");
      res.status(400).send("Missing raw body");
      return;
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (err: any) {
      logger.error("stripeWebhook_signature_error", { message: err?.message });
      res.status(400).send(`Webhook Error: ${err.message}`);
      return;
    }

    const eventLogRef = db.collection("stripeEvents").doc(event.id);
    const existingLog = await eventLogRef.get();
    if (existingLog.exists) {
      res.status(200).send("ok");
      return;
    }

    const eventCreated = typeof event.created === "number"
      ? Timestamp.fromMillis(event.created * 1000)
      : Timestamp.now();
    const logPayload: Record<string, unknown> = {
      type: event.type,
      created: eventCreated,
      receivedAt: FieldValue.serverTimestamp(),
      uid: null,
      email: null,
      priceId: null,
      mode: null,
      amount: null,
      status: null,
    };

    try {
      logger.info("stripe_webhook_event", { type: event.type, id: event.id });
      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object as Stripe.Checkout.Session;
          const uid = (session.metadata?.uid as string) || null;
          const priceId = (session.metadata?.priceId as string) || null;
          logPayload.uid = uid;
          logPayload.email = (session.customer_details?.email as string) || session.customer_email || null;
          logPayload.priceId = priceId;
          logPayload.mode = session.mode || null;
          logPayload.amount = session.amount_total ?? null;
          logPayload.status = session.payment_status || null;
          if (uid && priceId) {
            if (session.mode === "payment") {
              const credits = PRICE_CREDIT_MAP[priceId] ?? 0;
              if (credits > 0) {
                const opId = `stripe_${event.id}_credits`;
                await runUserOperation(uid, opId, { type: "stripe_checkout", amount: credits, source: event.id }, async () => {
                  await addCredits(uid, credits, `Checkout ${priceId}`, 12);
                });
              }
            }
            if (session.mode === "subscription") {
              await setSubscriptionStatus(uid, "active", priceId, null);
            }
          }
          break;
        }
        case "invoice.payment_succeeded": {
          const invoice = event.data.object as Stripe.Invoice;
          const uid = (invoice.metadata?.uid as string) || null;
          logPayload.uid = uid;
          logPayload.email = (invoice.customer_email as string) || null;
          logPayload.amount = invoice.amount_paid ?? null;
          logPayload.status = invoice.status || null;
          if (uid) {
            const lines = Array.isArray(invoice.lines?.data) ? invoice.lines.data : [];
            let totalCredits = 0;
            let subscriptionPriceId: string | null = null;
            let renewalUnix: number | null = null;

            for (const line of lines) {
              const priceId = (line.price?.id as string) || null;
              if (!priceId) {
                continue;
              }
              const credits = PRICE_CREDIT_MAP[priceId] ?? 0;
              if (credits > 0) {
                totalCredits += credits;
              }
              if (!subscriptionPriceId && SUBSCRIPTION_PRICE_IDS.has(priceId)) {
                subscriptionPriceId = priceId;
                renewalUnix = line.period?.end || null;
              }
            }

            if (totalCredits > 0) {
              const opId = `stripe_${event.id}_invoice`;
              await runUserOperation(uid, opId, { type: "stripe_invoice", amount: totalCredits, source: event.id }, async () => {
                await addCredits(uid, totalCredits, "Stripe invoice", 12);
              });
            }

            if (subscriptionPriceId) {
              await setSubscriptionStatus(uid, "active", subscriptionPriceId, renewalUnix);
              logPayload.priceId = subscriptionPriceId;
              logPayload.mode = "subscription";
            }
          }
          break;
        }
        case "customer.subscription.updated": {
          const subscription = event.data.object as Stripe.Subscription;
          const uid = (subscription.metadata?.uid as string) || null;
          logPayload.uid = uid;
          logPayload.email = (subscription.metadata?.email as string) || null;
          if (uid) {
            const status = (subscription.status as string) || "active";
            const normalized = status === "active" || status === "trialing" ? "active" : status === "canceled" ? "canceled" : "none";
            const priceId = (subscription.items?.data?.[0]?.price?.id as string) || null;
            const currentPeriodEnd = subscription.current_period_end || null;
            await setSubscriptionStatus(uid, normalized as any, priceId, currentPeriodEnd);
            logPayload.priceId = priceId;
            logPayload.status = normalized;
            logPayload.mode = subscription.cancel_at_period_end ? "cancel_pending" : "subscription";
          }
          break;
        }
        case "customer.subscription.deleted": {
          const subscription = event.data.object as Stripe.Subscription;
          const uid = (subscription.metadata?.uid as string) || null;
          logPayload.uid = uid;
          logPayload.email = (subscription.metadata?.email as string) || null;
          logPayload.priceId = (subscription.items?.data?.[0]?.price?.id as string) || null;
          logPayload.status = "canceled";
          if (uid) {
            await setSubscriptionStatus(uid, "canceled", null, null);
          }
          break;
        }
        case "payment_intent.payment_failed": {
          const intent = event.data.object as Stripe.PaymentIntent;
          const uid = (intent.metadata?.uid as string) || null;
          logPayload.uid = uid;
          logPayload.email = (intent.receipt_email as string) || null;
          logPayload.amount = intent.amount ?? null;
          logPayload.status = intent.status || "failed";
          logPayload.mode = intent.payment_method_types?.[0] || null;
          logPayload.priceId = (intent.metadata?.priceId as string) || null;
          break;
        }
        default: {
          // Defensive guard: ignore non-transactional events without crashing
          logger.warn("stripeWebhook_ignored_event", { type: event.type, id: event.id });
          break;
        }
      }

      await eventLogRef.set(
        {
          ...logPayload,
          processedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      res.status(200).send("ok");
      return;
    } catch (err: any) {
      logger.error("stripeWebhook_handler_error", { message: err?.message || err });
      await eventLogRef.set(
        {
          ...logPayload,
          error: err?.message || String(err),
          processedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      res.status(500).send("Handler error");
      return;
    }
  }
);
