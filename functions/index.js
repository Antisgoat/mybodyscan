// Cloud Functions v2 (Node 20, ESM) — Stripe Checkout wired with secrets

import functions from "firebase-functions";
import admin from "firebase-admin";
import Stripe from "stripe";
import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";

admin.initializeApp();

// Prefer functions.config for secrets so they can be managed via Firebase
// config rather than checked into source. Environment variables act as a
// fallback for local development or Secret Manager integration.
const cfg = (functions.config && functions.config()) || {};
const STRIPE_SECRET = (cfg.stripe && cfg.stripe.secret) || process.env.STRIPE_SECRET;
const STRIPE_WEBHOOK = (cfg.stripe && cfg.stripe.webhook) || process.env.STRIPE_WEBHOOK;

if (!STRIPE_SECRET || !STRIPE_WEBHOOK) {
  console.error("Missing Stripe secrets. Need stripe.secret and stripe.webhook.");
}

// Pinned Stripe client for deterministic API behaviour.
const stripe = new Stripe(STRIPE_SECRET, { apiVersion: "2024-06-20" });

// Make region global (secrets come from functions.config instead of secret mgr)
setGlobalOptions({
  region: "us-central1",
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

// ===== Callable: create Stripe Checkout session =====
export const createCheckoutSession = onCall(async (request) => {
  const uid = assertAuthed(request.auth);
  const plan = String(request.data?.plan || "");

  if (!Object.prototype.hasOwnProperty.call(PRICES, plan)) {
    throw new HttpsError("invalid-argument", "Invalid plan");
  }

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
    const sig = req.headers["stripe-signature"];
    console.log(
      "hasSig:", !!sig,
      "rawIsBuf:", Buffer.isBuffer(req.rawBody),
      "rawLen:", req.rawBody ? req.rawBody.length : 0
    );
    console.log(
      "usingSecretSource:",
      cfg?.stripe?.webhook
        ? "functions.config"
        : process.env.STRIPE_WEBHOOK
        ? "secretManagerEnv"
        : "none"
    );
    console.log(
      "whsec prefix (masked):",
      STRIPE_WEBHOOK ? STRIPE_WEBHOOK.slice(0, 10) + "***" : "none"
    );
    event = stripe.webhooks.constructEvent(req.rawBody, sig, STRIPE_WEBHOOK);
  } catch (e) {
    console.error("Webhook verify failed:", e?.message);
    res.status(400).send(`Webhook Error: ${e?.message}`);
    return;
  }

  console.log("Stripe event:", event.type);
  res.json({ received: true });
});

