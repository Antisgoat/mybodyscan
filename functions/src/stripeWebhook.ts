import { onRequest } from "firebase-functions/v2/https";
import { stripe, setSubscriptionStatus } from "./stripe/common.js";
import * as logger from "firebase-functions/logger";
import Stripe from "stripe";
import { FieldValue, getFirestore } from "./firebase.js";

const db = getFirestore();

function parseCredits(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const PLAN_ONE_CREDITS = parseCredits(process.env.PLAN_ONE_CREDITS, 1);
const PLAN_MONTHLY_CREDITS = parseCredits(process.env.PLAN_MONTHLY_CREDITS, 3);
const PLAN_YEARLY_CREDITS = parseCredits(process.env.PLAN_YEARLY_CREDITS, 36);

const PRICE_ONE =
  process.env.PRICE_ONE ||
  process.env.VITE_PRICE_ONE ||
  process.env.STRIPE_PRICE_ONE ||
  process.env.STRIPE_PRICE_SUB_ONCE ||
  "";
const PRICE_MONTHLY =
  process.env.PRICE_MONTHLY ||
  process.env.VITE_PRICE_MONTHLY ||
  process.env.STRIPE_PRICE_SUB_MONTHLY ||
  "";
const PRICE_YEARLY =
  process.env.PRICE_YEARLY ||
  process.env.VITE_PRICE_YEARLY ||
  process.env.STRIPE_PRICE_SUB_ANNUAL ||
  "";
const PRICE_EXTRA = process.env.PRICE_EXTRA || process.env.VITE_PRICE_EXTRA || "";

type PlanInfo = {
  plan: "one" | "monthly" | "yearly" | "extra";
  credits: number;
};

const priceToPlan = new Map<string, PlanInfo>(
  [
    PRICE_ONE ? [PRICE_ONE, { plan: "one", credits: PLAN_ONE_CREDITS }] : null,
    PRICE_MONTHLY ? [PRICE_MONTHLY, { plan: "monthly", credits: PLAN_MONTHLY_CREDITS }] : null,
    PRICE_YEARLY ? [PRICE_YEARLY, { plan: "yearly", credits: PLAN_YEARLY_CREDITS }] : null,
    PRICE_EXTRA ? [PRICE_EXTRA, { plan: "extra", credits: PLAN_ONE_CREDITS }] : null,
  ].filter((entry): entry is [string, PlanInfo] => Boolean(entry?.[0])),
);

async function uidFromCustomer(customerId: string): Promise<string> {
  if (!customerId) return "";
  const customer = await stripe.customers.retrieve(customerId);
  if (Array.isArray(customer)) return "";
  if ("deleted" in customer && customer.deleted) {
    return "";
  }
  const activeCustomer = customer as Stripe.Customer;
  return (activeCustomer.metadata?.uid as string) || "";
}

async function recordLedgerDeposit(
  eventId: string,
  uid: string,
  amount: number,
  meta: Record<string, unknown>,
): Promise<boolean> {
  if (!uid || !amount || amount <= 0) return false;
  const ledgerRef = db.collection("credits_ledger").doc(eventId);
  const userRef = db.collection("users").doc(uid);

  return await db.runTransaction(async (tx) => {
    const existing = await tx.get(ledgerRef);
    if (existing.exists) {
      return false;
    }
    const snapshot = await tx.get(userRef);
    const snapshotData = snapshot.exists ? (snapshot.data() as { credits?: number } | undefined) : undefined;
    const currentCredits = typeof snapshotData?.credits === "number" ? snapshotData.credits : 0;
    tx.set(
      ledgerRef,
      {
        uid,
        amount,
        meta,
        createdAt: FieldValue.serverTimestamp(),
      },
      { merge: false },
    );
    tx.set(
      userRef,
      {
        credits: currentCredits + amount,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    return true;
  });
}

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
        const priceId = (session.metadata?.priceId as string) || "";
        const planInfo = priceToPlan.get(priceId);
        if (uid && session.mode === "payment" && session.payment_status === "paid" && planInfo) {
          const granted = await recordLedgerDeposit(`checkout:${session.id}`, uid, planInfo.credits, {
            plan: planInfo.plan,
            priceId,
            sessionId: session.id,
          });
          if (granted) {
            logger.info("credits_deposited", { uid, plan: planInfo.plan, amount: planInfo.credits, session: session.id });
          }
        }
        break;
      }
      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        const sub = invoice.subscription as string | null;
        const line = invoice.lines?.data?.[0] ?? null;
        const priceId = (line?.price?.id as string) || "";
        const planInfo = priceToPlan.get(priceId);
        const customerId = (invoice.customer as string) || "";
        const uid = await uidFromCustomer(customerId);
        if (uid) {
          const productRef = line?.price?.product;
          const product = typeof productRef === "string" ? productRef : undefined;
          await setSubscriptionStatus(uid, "active", product, priceId || undefined);
          if (planInfo) {
            const granted = await recordLedgerDeposit(`invoice:${invoice.id}`, uid, planInfo.credits, {
              plan: planInfo.plan,
              priceId,
              invoiceId: invoice.id,
              subscriptionId: sub,
            });
            if (granted) {
              logger.info("subscription_credits_deposited", {
                uid,
                amount: planInfo.credits,
                priceId,
                invoiceId: invoice.id,
              });
            }
          }
        }
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = (sub.customer as string) || "";
        const uid = await uidFromCustomer(customerId);
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
