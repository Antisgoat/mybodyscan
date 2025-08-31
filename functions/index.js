// Cloud Functions v2 (Node 20, ESM) — Stripe Checkout wired with secrets

import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";
import admin from "firebase-admin";
import Stripe from "stripe";

admin.initializeApp();

setGlobalOptions({
  region: "us-central1",
});

const getStripe = () => {
  const key = process.env.STRIPE_SECRET;
  if (!key) throw new Error("STRIPE_SECRET not set");
  return new Stripe(key, { apiVersion: "2024-06-20" });
};

const creditsByPlan = { single: 1, pack3: 3, pack5: 5, monthly: 3, annual: 36 };

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
export const createCheckoutSession = onCall(
  { secrets: ["STRIPE_SECRET"] },
  async (request) => {
    const stripe = getStripe();
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
  }
);

// ===== HTTPS: Stripe Webhook (credit grants + idempotency) =====
export const stripeWebhook = onRequest(
  { secrets: ["STRIPE_SECRET", "STRIPE_WEBHOOK"] },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    const sig = req.headers["stripe-signature"];
    const raw = req.rawBody;
    console.log(
      "hasSig:",
      !!sig,
      "rawIsBuf:",
      Buffer.isBuffer(raw),
      "rawLen:",
      raw?.length || 0
    );

    const stripe = getStripe();
    const whsec = process.env.STRIPE_WEBHOOK;
    if (!whsec) {
      console.error("STRIPE_WEBHOOK not set");
      res.status(500).send("missing-webhook-secret");
      return;
    }

    let event;
    try {
      event = stripe.webhooks.constructEvent(raw, sig, whsec);
    } catch (e) {
      console.error("Webhook verify failed:", e?.message);
      res.status(400).send(`Webhook Error: ${e?.message}`);
      return;
    }

    const db = admin.firestore();
    const eventId = event.id;
    const seenRef = db.collection("stripe_events").doc(eventId);

    // Idempotency
    const seenSnap = await seenRef.get();
    if (seenSnap.exists) {
      console.log("Duplicate event:", eventId);
      res.status(200).send("ok-duplicate");
      return;
    }

    try {
      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object;
          const uid = session?.metadata?.uid;
          const plan = session?.metadata?.plan;
          if (!uid || !plan) {
            console.warn("Missing uid/plan in metadata", {
              uid,
              plan,
              sessionId: session?.id,
            });
            break;
          }
          const add = creditsByPlan[plan] ?? 1;
          const userRef = db.collection("users").doc(uid);
          await db.runTransaction(async (tx) => {
            const snap = await tx.get(userRef);
            const current =
              (snap.exists ? snap.data()?.credits || 0 : 0) + add;
            tx.set(
              userRef,
              {
                credits: current,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              },
              { merge: true }
            );
          });
          console.log(`Granted ${add} credits to uid=${uid} via plan=${plan}`);
          break;
        }

        case "invoice.payment_succeeded": {
          // Optional: monthly top-ups for subscriptions
          console.log("invoice.payment_succeeded (noop)");
          break;
        }

        default:
          console.log("Unhandled event:", event.type);
      }

      await seenRef.set({
        type: event.type,
        at: admin.firestore.FieldValue.serverTimestamp(),
      });
      res.status(200).send("ok");
    } catch (err) {
      console.error(
        "Handler error:",
        err?.stack || err?.message || err
      );
      res.status(500).send("internal-error");
    }
  }
);

