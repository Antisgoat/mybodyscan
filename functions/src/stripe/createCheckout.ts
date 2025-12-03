import type Stripe from "stripe";
import { onCallWithOptionalAppCheck } from "../util/callable.js";
import { HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { getStripe } from "./common.js";
const APP_BASE_URL = process.env.APP_BASE_URL || "https://mybodyscanapp.com";

export const createCheckout = onCallWithOptionalAppCheck(async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");

  const priceId = String(req.data?.priceId || "").trim();
  const mode = req.data?.mode === "payment" ? "payment" : "subscription";
  if (!priceId) throw new HttpsError("invalid-argument", "priceId required");

  const params: Stripe.Checkout.SessionCreateParams = {
    mode,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${APP_BASE_URL}/plans?success=1`,
    cancel_url: `${APP_BASE_URL}/plans?canceled=1`,
    metadata: { uid },
  };

  const promo = (req.data?.promoCode as string | undefined)?.trim();
  if (promo && mode === "subscription") {
    params.discounts = [{ promotion_code: promo }];
  }

  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create(params);
    return { sessionId: session.id ?? null, url: session.url ?? null };
  } catch (error: any) {
    logger.error("createCheckout_failed", {
      code: error?.code,
      type: error?.type,
      message: error?.message,
    });
    const code = typeof error?.code === "string" ? error.code : "";
    if (code === "resource_missing" || code === "no_such_price") {
      throw new HttpsError("invalid-argument", "Invalid plan configuration.");
    }
    if (error?.statusCode === 401 || error?.statusCode === 403) {
      throw new HttpsError("failed-precondition", "Stripe configuration invalid.");
    }
    throw new HttpsError("unavailable", "Billing is temporarily unavailable.");
  }
});
