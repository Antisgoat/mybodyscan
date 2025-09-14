import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import Stripe from "stripe";
import { PLAN_CREDITS } from "./pricing.js";

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
      const plan = session.metadata?.plan as keyof typeof PLAN_CREDITS | undefined;
      if (uid && plan && plan in PLAN_CREDITS) {
        const userRef = db.doc(`users/${uid}`);
        const ledgerRef = db.doc(`users/${uid}/ledger/${event.id}`);
        await db.runTransaction(async (tx) => {
          const snap = await tx.get(userRef);
          const credits = (snap.get("credits") ?? 0) + PLAN_CREDITS[plan];
          const data: any = { credits };
          if (session.subscription) {
            data.plan = plan;
            data.stripeSubscriptionId = session.subscription;
            data.stripeCustomerId = session.customer;
          }
          tx.set(userRef, data, { merge: true });
          tx.set(ledgerRef, {
            type: event.type,
            plan,
            credits: PLAN_CREDITS[plan],
            amount_total: session.amount_total,
            createdAt: FieldValue.serverTimestamp(),
          });
        });
      }
      break;
    }
    case "invoice.payment_succeeded": {
      const invoice = event.data.object as Stripe.Invoice;
      const subId = invoice.subscription;
      if (typeof subId === "string") {
        const users = await db
          .collection("users")
          .where("stripeSubscriptionId", "==", subId)
          .get();
        for (const doc of users.docs) {
          const plan = doc.get("plan") as keyof typeof PLAN_CREDITS | undefined;
          if (plan && plan in PLAN_CREDITS) {
            await doc.ref.update({
              credits: (doc.get("credits") ?? 0) + PLAN_CREDITS[plan],
            });
            await db
              .doc(`users/${doc.id}/ledger/${event.id}`)
              .set({
                type: event.type,
                plan,
                credits: PLAN_CREDITS[plan],
                amount_total: invoice.amount_paid,
                createdAt: FieldValue.serverTimestamp(),
              });
          }
        }
      }
      break;
    }
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const subId = subscription.id;
      const users = await db
        .collection("users")
        .where("stripeSubscriptionId", "==", subId)
        .get();
      for (const doc of users.docs) {
        await doc.ref.update({ plan: null, stripeSubscriptionId: null });
      }
      break;
    }
    default:
      break;
  }

  res.status(200).send("ok");
});
