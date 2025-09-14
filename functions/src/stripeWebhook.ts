import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import Stripe from "stripe";

if (!getApps().length) initializeApp();
const db = getFirestore();

const stripeSecret = defineSecret("STRIPE_SECRET");
const webhookSecret = defineSecret("STRIPE_WEBHOOK");

const planCredits: Record<string, number> = {
  SINGLE: 1,
  PACK3: 3,
  PACK5: 5,
  MONTHLY: 5,
  ANNUAL: 60,
};

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
  await eventsRef.set({ receivedAt: Date.now(), type: event.type });

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const uid = session.metadata?.uid as string | undefined;
      const plan = session.metadata?.plan as string | undefined;
      if (uid && plan && plan in planCredits) {
        const userRef = db.doc(`users/${uid}`);
        await db.runTransaction(async (tx) => {
          const snap = await tx.get(userRef);
          const credits = (snap.get("credits") ?? 0) + planCredits[plan];
          const data: any = { credits };
          if (session.subscription) {
            data.plan = plan;
            data.stripeSubscriptionId = session.subscription;
            data.stripeCustomerId = session.customer;
          }
          tx.set(userRef, data, { merge: true });
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
          const plan = doc.get("plan") as string | undefined;
          if (plan && plan in planCredits) {
            await doc.ref.update({
              credits: (doc.get("credits") ?? 0) + planCredits[plan],
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
