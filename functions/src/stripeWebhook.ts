import { onRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import Stripe from "stripe";
import { getFirestore } from "firebase-admin/firestore";
import { grantCredits, refreshCreditsSummary, setSubscriptionStatus } from "./credits";

export const stripeWebhook = onRequest({ secrets: ["STRIPE_SECRET_KEY","STRIPE_WEBHOOK_SECRET"] }, async (req, res) => {
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2024-06-20" as any });
    const sig = req.headers["stripe-signature"] as string;
    const event = stripe.webhooks.constructEvent(
      req.rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );

    const db = getFirestore();
    await db
      .collection("stripe_events")
      .doc(event.id)
      .set({
        type: event.type,
        created: new Date(),
        raw: req.rawBody.toString().slice(0, 10000),
      });
    const handleGrant = async (checkoutSession: any, context: string) => {
      const uid = checkoutSession?.metadata?.uid;  // we will send uid in Checkout metadata
      const priceId =
        checkoutSession?.metadata?.price_id ||
        checkoutSession?.mode === "subscription"
          ? checkoutSession?.subscription && (await stripe.subscriptions.retrieve(checkoutSession.subscription)).items.data[0]?.price?.id
          : checkoutSession?.line_items?.data?.[0]?.price?.id;

      if (!uid || !priceId) { logger.warn("Missing uid or priceId"); return; }

      // Look up credits config from Firestore (pricing/{priceId})
      const pricingDoc = await db.doc(`pricing/${priceId}`).get();
      if (!pricingDoc.exists) { logger.error("No pricing config for", priceId); return; }
      const { credits, credit_expiry_days } = pricingDoc.data() as any;

      await grantCredits(uid, credits, credit_expiry_days, priceId, context);
      await refreshCreditsSummary(uid);
      await db.collection("payments").add({
        provider: "stripe",
        eventType: context,
        uid, priceId, creditsGranted: credits,
        ts: new Date(),
      });
    };

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as any;
        await handleGrant(session, "checkout.session.completed");
        break;
      }
      case "invoice.paid": {
        const invoice = event.data.object as any;
        const subId = invoice.subscription;
        if (subId) {
          const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2024-06-20" as any });
          const sub = await stripe.subscriptions.retrieve(subId);
          const uid = sub.metadata?.uid || invoice.metadata?.uid;
          const priceId = sub.items.data[0]?.price?.id;
          if (uid && priceId) {
            const db = getFirestore();
            const pricingDoc = await db.doc(`pricing/${priceId}`).get();
            if (pricingDoc.exists) {
              const { credits, credit_expiry_days } = pricingDoc.data() as any;
              await grantCredits(uid, credits, credit_expiry_days, priceId, "invoice.paid");
              await refreshCreditsSummary(uid);
              await setSubscriptionStatus(uid, "active", priceId, sub.current_period_end);
            }
          }
        }
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as any;
        const uid = sub.metadata?.uid;
        if (uid) await setSubscriptionStatus(uid, "canceled", null, null);
        break;
      }
      default:
        logger.info(`Unhandled event: ${event.type}`);
    }

    res.status(200).send({ received: true });
  } catch (e:any) {
    logger.error(e);
    res.status(400).send(`Webhook Error: ${e.message}`);
  }
});
