import { randomUUID } from "node:crypto";
import type Stripe from "stripe";
import { onCallWithOptionalAppCheck } from "../util/callable.js";
import { HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { ensureSoftAppCheckFromCallable } from "../lib/appCheckSoft.js";
import { getStripe } from "./common.js";
import { getAuth } from "../firebase.js";
import { resolveStripePlan } from "./plans.js";
import { stripeSecretKeyParam, stripeSecretParam } from "./keys.js";

const APP_BASE_URL =
  process.env.APP_BASE_URL ||
  process.env.HOST_BASE_URL ||
  "https://mybodyscanapp.com";

export const createCheckout = onCallWithOptionalAppCheck(
  async (req) => {
    const requestId =
      req.rawRequest?.get("x-request-id")?.trim() || randomUUID();
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
    const selectedPlan = resolveStripePlan(priceId);
    if (!priceId || !selectedPlan) {
      throw new HttpsError("invalid-argument", "Invalid plan selected.", {
        debugId: requestId,
        reason: "invalid_price",
      });
    }

    try {
      const stripe = getStripe();
      const user = await getAuth().getUser(uid);
      const existing = await stripe.customers.search({
        query: `metadata['uid']:'${uid}'`,
        limit: 1,
      });
      let customer = existing.data[0];
      if (!customer) {
        customer = await stripe.customers.create({
          email: user.email || undefined,
          metadata: { uid },
        });
      } else if (customer.metadata?.uid !== uid) {
        customer = await stripe.customers.update(customer.id, {
          metadata: { ...customer.metadata, uid },
        });
      }

      const metadata = {
        uid,
        priceId,
        plan: selectedPlan.plan,
      };
      const params: Stripe.Checkout.SessionCreateParams = {
        mode: selectedPlan.mode,
        customer: customer.id,
        client_reference_id: uid,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${APP_BASE_URL.replace(/\/$/, "")}/plans?success=1`,
        cancel_url: `${APP_BASE_URL.replace(/\/$/, "")}/plans?canceled=1`,
        metadata,
        payment_intent_data:
          selectedPlan.mode === "payment" ? { metadata } : undefined,
        subscription_data:
          selectedPlan.mode === "subscription" ? { metadata } : undefined,
      };

      const promo =
        typeof req.data?.promoCode === "string"
          ? req.data.promoCode.trim()
          : "";
      if (promo && selectedPlan.mode === "subscription") {
        params.discounts = [{ promotion_code: promo }];
      }

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
        throw new HttpsError(
          "invalid-argument",
          "Invalid plan configuration.",
          {
            debugId: requestId,
            reason: "stripe_price_missing",
          }
        );
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
      throw new HttpsError(
        "unavailable",
        "Billing is temporarily unavailable.",
        {
          debugId: requestId,
          reason: "stripe_unavailable",
        }
      );
    }
  },
  {
    region: "us-central1",
    secrets: [stripeSecretParam, stripeSecretKeyParam],
  }
);
