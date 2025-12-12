import { randomUUID } from "node:crypto";
import type Stripe from "stripe";
import { onCallWithOptionalAppCheck } from "../util/callable.js";
import { HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { ensureSoftAppCheckFromCallable } from "../lib/appCheckSoft.js";
import { getStripe } from "./common.js";
const APP_BASE_URL = process.env.APP_BASE_URL || "https://mybodyscanapp.com";

export const createCheckout = onCallWithOptionalAppCheck(async (req) => {
  const requestId = req.rawRequest?.get("x-request-id")?.trim() || randomUUID();
  await ensureSoftAppCheckFromCallable(req, {
    fn: "createCheckout",
    uid: req.auth?.uid ?? null,
    requestId,
  });

  const uid = req.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Sign in required.", {
      debugId: requestId,
    });
  }

  const priceIdRaw =
    typeof req.data?.priceId === "string" ? req.data.priceId : "";
  const priceId = priceIdRaw.trim();
  if (!priceId || !priceId.startsWith("price_")) {
    throw new HttpsError("invalid-argument", "Invalid plan selected.", {
      debugId: requestId,
      reason: "invalid_price",
    });
  }

  const mode = req.data?.mode === "payment" ? "payment" : "subscription";

  const params: Stripe.Checkout.SessionCreateParams = {
    mode,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${APP_BASE_URL}/plans?success=1`,
    cancel_url: `${APP_BASE_URL}/plans?canceled=1`,
    metadata: { uid },
  };

  const promo =
    typeof req.data?.promoCode === "string" ? req.data.promoCode.trim() : "";
  if (promo && mode === "subscription") {
    params.discounts = [{ promotion_code: promo }];
  }

  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create(params);
    return {
      sessionId: session.id ?? null,
      url: session.url ?? null,
      debugId: requestId,
    };
  } catch (error: any) {
    logger.error("createCheckout_failed", {
      code: error?.code,
      type: error?.type,
      message: error?.message,
      requestId,
    });
    const code = typeof error?.code === "string" ? error.code : "";
    if (code === "resource_missing" || code === "no_such_price") {
      throw new HttpsError("invalid-argument", "Invalid plan configuration.", {
        debugId: requestId,
        reason: "stripe_price_missing",
      });
    }
    if (error?.statusCode === 401 || error?.statusCode === 403) {
      throw new HttpsError(
        "failed-precondition",
        "Stripe configuration invalid.",
        {
          debugId: requestId,
          reason: "stripe_auth_error",
        }
      );
    }
    throw new HttpsError("unavailable", "Billing is temporarily unavailable.", {
      debugId: requestId,
      reason: "stripe_unavailable",
    });
  }
});
