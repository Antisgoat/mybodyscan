import { onCall } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { HttpsError } from "firebase-functions/v2/https";
import Stripe from "stripe";
import { PRICES } from "./pricing.js";

const stripeSecret = defineSecret("STRIPE_SECRET");

export const createCheckoutSession = onCall({
  region: "us-central1",
  secrets: [stripeSecret],
}, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Auth required");
  }
  const { plan } = request.data as { plan: keyof typeof PRICES };
  if (!plan || !(plan in PRICES)) {
    throw new HttpsError("invalid-argument", "Invalid plan");
  }
  const stripe = new Stripe(stripeSecret.value(), { apiVersion: "2024-06-20" });
  const session = await stripe.checkout.sessions.create({
    mode: plan === "MONTHLY" || plan === "ANNUAL" ? "subscription" : "payment",
    line_items: [{ price: PRICES[plan], quantity: 1 }],
    metadata: { uid: request.auth.uid, plan },
    success_url: "https://mybodyscanapp.com/success",
    cancel_url: "https://mybodyscanapp.com/cancel",
  });
  return { id: session.id, url: session.url };
});
