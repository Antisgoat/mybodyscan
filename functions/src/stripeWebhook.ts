import { onRequest } from "firebase-functions/v2/https";
import Stripe from "stripe";
import { getSecret } from "firebase-functions/params";

import { addCredits, setSubscriptionStatus } from "./credits.js";
import { FieldValue, Timestamp, getFirestore } from "./firebase.js";

const STRIPE_WEBHOOK = getSecret("STRIPE_WEBHOOK");
const STRIPE_SECRET = getSecret("STRIPE_SECRET");

const db = getFirestore();

export const stripeWebhook = onRequest(
  {
    region: "us-central1",
    cors: ["https://mybodyscanapp.com", "https://mybodyscan-f3daf.web.app"],
    maxInstances: 3,
    secrets: ["STRIPE_WEBHOOK", "STRIPE_SECRET"],
    consumeAppCheckToken: false,
    rawBody: true,
  },
  async (req, res) => {
    if (req.method !== "POST") {
      return res.status(405).send("Method Not Allowed");
    }

    const signature = req.header("Stripe-Signature");
    if (!signature) {
      return res.status(400).send("Missing signature");
    }

    const stripeSecret = STRIPE_SECRET.value();
    const webhookSecret = STRIPE_WEBHOOK.value();
    if (!stripeSecret || !webhookSecret) {
      console.error("stripeWebhook", "Missing Stripe secrets");
      return res.status(500).send("Missing Stripe secrets");
    }

    const stripe = new Stripe(stripeSecret, { apiVersion: "2024-06-20" });

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(req.rawBody, signature, webhookSecret);
    } catch (err: any) {
      console.error("stripeWebhook", err?.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    const expiresAt = Timestamp.fromDate(new Date(Date.now() + 1000 * 60 * 60 * 24 * 30));
    const eventRef = db.collection("stripe_events").doc(event.id);
    const shouldProcess = await db.runTransaction(async (tx) => {
      const existing = await tx.get(eventRef);
      if (existing.exists) {
        return false;
      }
      tx.create(eventRef, {
        type: event.type,
        receivedAt: FieldValue.serverTimestamp(),
        expiresAt,
      });
      return true;
    });

    if (!shouldProcess) {
      return res.status(200).send("ok");
    }

    try {
      console.log("stripe_webhook_event", { type: event.type, id: event.id });
      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object as Stripe.Checkout.Session;
          const uid = (session.metadata?.uid as string) || null;
          const priceId = (session.metadata?.priceId as string) || null;
          if (uid && priceId) {
            await addCredits(uid, 1, `Checkout ${priceId}`, 12);
          }
          break;
        }
        case "invoice.payment_succeeded": {
          const invoice = event.data.object as Stripe.Invoice;
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
          const subscription = event.data.object as Stripe.Subscription;
          const uid = (subscription.metadata?.uid as string) || null;
          if (uid) {
            await setSubscriptionStatus(uid, "canceled", null, null);
          }
          break;
        }
        default: {
          console.warn("stripeWebhook", "Ignoring unsupported event", event.type);
          break;
        }
      }

      await eventRef.set({ processedAt: FieldValue.serverTimestamp() }, { merge: true });
      return res.status(200).send("ok");
    } catch (err: any) {
      console.error("stripeWebhook handler", err?.message || err);
      await eventRef.set({ error: err?.message || String(err), processedAt: FieldValue.serverTimestamp() }, { merge: true });
      await eventRef.delete().catch(() => undefined);
      return res.status(500).send("Handler error");
    }
  }
);
