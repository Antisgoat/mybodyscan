import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import Stripe from "stripe";
import { PRICES, PRO_BUNDLE_CREDITS } from "./pricing.js";

if (!getApps().length) initializeApp();
const db = getFirestore();

const stripeSecret = defineSecret("STRIPE_SECRET");
const webhookSecret = defineSecret("STRIPE_WEBHOOK");

export const stripeWebhook = onRequest({
  region: "us-central1",
  secrets: [stripeSecret, webhookSecret],
  rawBody: true,
}, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }
  const sig = req.headers["stripe-signature"] as string | undefined;
  if (!sig) {
    res.status(400).send("Missing signature");
    return;
  }
  const stripe = new Stripe(stripeSecret.value(), { apiVersion: "2024-06-20" });
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.rawBody, sig, webhookSecret.value());
  } catch (err: any) {
    res.status(400).send(`Webhook Error: ${err.message}`);
    return;
  }
  const eventsRef = db.doc(`stripe_events/${event.id}`);
  const existing = await eventsRef.get();
  if (existing.exists) {
    res.status(200).send("ok");
    return;
  }
  await eventsRef.set({
    receivedAt: FieldValue.serverTimestamp(),
    type: event.type,
    _expiresAt: Timestamp.fromMillis(Date.now() + 30 * 24 * 60 * 60 * 1000),
  });

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const uid = session.metadata?.uid as string | undefined;
      const plan = session.metadata?.plan as keyof typeof PRICES | undefined;
      if (!uid || !plan) break;
      const userRef = db.doc(`users/${uid}`);
      const updates: any = { updatedAt: FieldValue.serverTimestamp() };
      if (plan === "STARTER" || plan === "EXTRA") {
        updates.credits = FieldValue.increment(1);
      } else if (plan === "PRO_MONTHLY" || plan === "ELITE_ANNUAL") {
        if (typeof session.subscription === "string") {
          const sub = await stripe.subscriptions.retrieve(session.subscription);
          updates.subscription = {
            id: sub.id,
            status: "active",
            periodEnd: Timestamp.fromMillis(sub.current_period_end * 1000),
            customerId: session.customer,
          };
          if (plan === "PRO_MONTHLY") {
            updates.bundle = { remaining: PRO_BUNDLE_CREDITS };
          }
        }
      }
      await userRef.set(updates, { merge: true });
      break;
    }
    case "invoice.payment_succeeded": {
      const invoice = event.data.object as Stripe.Invoice;
      if (invoice.billing_reason !== "subscription_cycle") break;
      const subId = invoice.subscription;
      if (typeof subId !== "string") break;
      const sub = await stripe.subscriptions.retrieve(subId);
      const users = await db
        .collection("users")
        .where("subscription.id", "==", sub.id)
        .get();
      for (const doc of users.docs) {
        const data: any = {
          subscription: {
            ...doc.get("subscription"),
            status: "active",
            periodEnd: Timestamp.fromMillis(sub.current_period_end * 1000),
          },
        };
        if (sub.items.data.some((i) => i.price.id === PRICES.PRO_MONTHLY)) {
          data.bundle = { remaining: PRO_BUNDLE_CREDITS };
        }
        await doc.ref.set(data, { merge: true });
      }
      break;
    }
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const users = await db
        .collection("users")
        .where("subscription.id", "==", subscription.id)
        .get();
      for (const doc of users.docs) {
        await doc.ref.set(
          { subscription: { ...doc.get("subscription"), status: "canceled" } },
          { merge: true }
        );
      }
      break;
    }
    default:
      break;
  }

  res.status(200).send("ok");
});
