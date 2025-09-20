import { onRequest } from "firebase-functions/v2/https";
import Stripe from "stripe";

import { grantCredits, refreshCreditsSummary, setSubscriptionStatus } from "./credits";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

function buildStripe(): Stripe | null {
  if (!STRIPE_SECRET_KEY) return null;
  return new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });
}

export const stripeWebhook = onRequest(async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }

  const stripe = buildStripe();
  if (!stripe || !STRIPE_WEBHOOK_SECRET) {
    res.status(200).send("mock-ok");
    return;
  }

  const signature = req.headers["stripe-signature"];
  if (typeof signature !== "string") {
    res.status(400).send("missing-signature");
    return;
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.rawBody, signature, STRIPE_WEBHOOK_SECRET);
  } catch (err: any) {
    console.error("stripeWebhook", err?.message);
    res.status(400).send(`invalid: ${err.message}`);
    return;
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const uid = (session.metadata?.uid as string) || null;
        const priceId = (session.metadata?.priceId as string) || null;
        if (uid && priceId) {
          await grantCredits(uid, 1, 365, priceId, "checkout.session.completed");
          await refreshCreditsSummary(uid);
        }
        break;
      }
      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        const uid = (invoice.metadata?.uid as string) || null;
        if (uid) {
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
      default:
        // ignore unsupported events
        break;
    }
    res.status(200).send("ok");
  } catch (err: any) {
    console.error("stripeWebhook handler", err?.message);
    res.status(500).send("error");
  }
});
