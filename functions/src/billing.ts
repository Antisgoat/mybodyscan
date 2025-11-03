import * as functions from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import Stripe from "stripe";

import { uidFromBearer } from "./util/auth.js";

const corsOrigins = [
  "https://mybodyscanapp.com",
  "https://www.mybodyscanapp.com",
  "https://mybodyscan-f3daf.web.app",
  "https://mybodyscan-f3daf.firebaseapp.com",
];
const stripeSecret = process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET || "";
const stripe = stripeSecret ? new Stripe(stripeSecret, { apiVersion: "2024-06-20" }) : null;

const PRICE_ONE = process.env.PRICE_ONE || process.env.VITE_PRICE_ONE || process.env.STRIPE_PRICE_SCAN || "";
const PRICE_MONTHLY =
  process.env.PRICE_MONTHLY || process.env.VITE_PRICE_MONTHLY || process.env.STRIPE_PRICE_SUB_MONTHLY || "";
const PRICE_YEARLY =
  process.env.PRICE_YEARLY || process.env.VITE_PRICE_YEARLY || process.env.STRIPE_PRICE_SUB_ANNUAL || "";
const PROMO = process.env.STRIPE_MONTHLY_PROMO_CODE || "";
const BASE_URL = process.env.APP_BASE_URL || process.env.VITE_APP_BASE_URL || "https://mybodyscanapp.com";

type CheckoutPlan = "one" | "monthly" | "yearly";

function resolvePlan(raw: unknown): CheckoutPlan | null {
  if (!raw || typeof raw !== "object") return null;
  const payload = raw as { plan?: string; kind?: string };
  const plan = String(payload.plan ?? payload.kind ?? "").trim();
  if (plan === "one" || plan === "monthly" || plan === "yearly") {
    return plan;
  }
  if (plan === "scan") return "one";
  if (plan === "sub_monthly") return "monthly";
  if (plan === "sub_annual") return "yearly";
  return null;
}

export const createCheckout = functions.onRequest({ region: "us-central1", cors: corsOrigins }, async (req, res) => {
  if (!stripe) {
    logger.error("createCheckout.missing_stripe_secret");
    res.status(501).json({ error: "stripe_unconfigured" });
    return;
  }

  if (req.method !== "POST") {
    res.status(405).send("Method not allowed");
    return;
  }

  try {
    const plan = resolvePlan(req.body);
    if (!plan) {
      res.status(400).json({ error: "invalid_plan" });
      return;
    }

    const uid = await uidFromBearer(req);
    if (!uid) {
      res.status(401).json({ error: "unauthenticated" });
      return;
    }

    let mode: Stripe.Checkout.SessionCreateParams.Mode;
    let priceId: string | undefined;
    if (plan === "one") {
      mode = "payment";
      priceId = PRICE_ONE;
    } else if (plan === "monthly") {
      mode = "subscription";
      priceId = PRICE_MONTHLY;
    } else {
      mode = "subscription";
      priceId = PRICE_YEARLY;
    }

    if (!priceId) {
      res.status(500).json({ error: "price_missing" });
      return;
    }

    const params: Stripe.Checkout.SessionCreateParams = {
      mode,
      success_url: `${BASE_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${BASE_URL}/plans`,
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: { uid, plan },
    };

    if (plan === "monthly" && PROMO) {
      params.discounts = [{ promotion_code: PROMO }];
    }

    const session = await stripe.checkout.sessions.create(params);
    res.json({ url: session.url });
  } catch (error: any) {
    logger.error("createCheckout.error", error);
    res.status(500).json({ error: "checkout_failed" });
  }
});
