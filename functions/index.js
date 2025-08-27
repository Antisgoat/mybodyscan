// Cloud Functions v2 (Node 20, ESM) — Stripe Checkout wired with secrets

import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";
import Stripe from "stripe";
import admin from "firebase-admin";

admin.initializeApp();

// Make region + secrets global (v2 style)
setGlobalOptions({
  region: "us-central1",
  secrets: ["STRIPE_SECRET", "STRIPE_WEBHOOK"],
});

// --- LIVE Stripe Price IDs (keep the ones you showed) ---
const PRICES = {
  single:  "price_1RuOpKQQU5vuhlNjipfFBsR0",
  pack3:   "price_1RuOr2QQU5vuhlNjcqTckCHL",
  pack5:   "price_1RuOrkQQU5vuhlNj15ebWfNP",
  monthly: "price_1RuOtOQQU5vuhlNjmXnQSsYq",
  annual:  "price_1RuOw0QQU5vuhlNjA5NZ66qq",
};

// Helpers
function assertAuthed(auth) {
  const uid = auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Login required");
  return uid;
}

function getStripe() {
  const key = process.env.STRIPE_SECRET;
  if (!key) throw new HttpsError("internal", "Stripe not configured");
  return new Stripe(key, { apiVersion: "2024-06-20" });
}

// ===== Callable: create Stripe Checkout session =====
export const createCheckoutSession = onCall(async (request) => {
  const uid = assertAuthed(request.auth);
  const plan = String(request.data?.plan || "");

  if (!Object.prototype.hasOwnProperty.call(PRICES, plan)) {
    throw new HttpsError("invalid-argument", "Invalid plan");
  }

  const stripe = getStripe();
  const priceId = PRICES[plan];
  const price = await stripe.prices.retrieve(priceId);
  const mode = price?.recurring ? "subscription" : "payment";

  const domain = "https://mybodyscanapp.com";

  const session = await stripe.checkout.sessions.create({
    mode,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${domain}/plans?success=1`,
    cancel_url: `${domain}/plans?canceled=1`,
    client_reference_id: uid,
    metadata: { uid, plan },
  });

  return { url: session.url };
});

// ===== HTTPS: Stripe Webhook (minimal verify + 200) =====
export const stripeWebhook = onRequest(async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).send("Method not allowed");
    return;
  }

  let event;
  try {
    const stripe = getStripe();
    const sig = req.headers["stripe-signature"];
    const endpointSecret = process.env.STRIPE_WEBHOOK;
    event = stripe.webhooks.constructEvent(req.rawBody, sig, endpointSecret);
  } catch (e) {
    console.error("Webhook verify failed:", e?.message);
    res.status(400).send(`Webhook Error: ${e?.message}`);
    return;
  }

  console.log("Stripe event:", event.type);
  res.json({ received: true });
});

