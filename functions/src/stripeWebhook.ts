import { onRequest } from "firebase-functions/v2/https";
import { stripe, incCredits, setSubscriptionStatus } from "./stripe/common.js";
import * as logger from "firebase-functions/logger";
import Stripe from "stripe";

export const stripeWebhook = onRequest({ cors: true, rawBody: true }, async (req, res) => {
  const sig = req.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET || "";
  if (!sig || !secret) return res.status(501).send("unconfigured");

  const rawBody = (req as unknown as { rawBody?: Buffer }).rawBody;
  if (!rawBody) {
    logger.error("Webhook missing raw body");
    return res.status(400).send("Missing body");
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, secret);
  } catch (err: any) {
    logger.error("Webhook signature verify failed", { err: err?.message });
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const uid = (session.metadata?.uid as string) || (session.client_reference_id as string) || "";
        if (uid && session.mode === "payment") {
          const credits = Math.max(1, Number(session.metadata?.credits || 1));
          await incCredits(uid, credits);
          logger.info("Credits granted", { uid, credits, session: session.id });
        }
        break;
      }
      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        const sub = invoice.subscription as string | null;
        const priceObj = invoice.lines?.data?.[0]?.price;
        const price = priceObj?.id ?? null;
        const productRef = priceObj?.product;
        const product = typeof productRef === "string" ? productRef : null;
        const customerId = (invoice.customer as string) || "";
        let uid = "";
        if (customerId) {
          const customer = await stripe.customers.retrieve(customerId);
          if (!Array.isArray(customer) && "metadata" in customer) {
            uid = (customer as any).metadata?.uid || "";
          }
        }
        const eligiblePrices = new Set(
          [process.env.STRIPE_PRICE_SUB_MONTHLY, process.env.STRIPE_PRICE_SUB_ANNUAL].filter(Boolean) as string[],
        );
        const depositCredits = price ? eligiblePrices.has(price) : false;
        if (uid) {
          await setSubscriptionStatus(uid, "active", product ?? undefined, price ?? undefined);
          if (depositCredits) {
            await incCredits(uid, 3);
            logger.info("Subscription active + credits deposited", { uid, sub, price });
          } else {
            logger.info("Subscription active", { uid, sub, price });
          }
        }
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = (sub.customer as string) || "";
        let uid = "";
        if (customerId) {
          const customer = await stripe.customers.retrieve(customerId);
          if (!Array.isArray(customer) && "metadata" in customer) {
            uid = (customer as any).metadata?.uid || "";
          }
        }
        if (uid) {
          await setSubscriptionStatus(uid, "canceled");
          logger.info("Subscription canceled", { uid, sub: sub.id });
        }
        break;
      }
      default:
        logger.debug("Unhandled Stripe event", { type: event.type });
    }
    res.status(200).send("[ok]");
  } catch (e: any) {
    logger.error("Webhook handler error", { err: e?.message, type: event.type });
    res.status(500).send("handler_error");
  }
});
