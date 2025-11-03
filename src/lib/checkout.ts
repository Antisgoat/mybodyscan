import { loadStripe, Stripe } from "@stripe/stripe-js";
import { call } from "./callable";

let stripePromise: Promise<Stripe | null> | null = null;

function getStripe() {
  if (!stripePromise) {
    const key = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
    if (!key) throw new Error("Stripe publishable key missing");
    stripePromise = loadStripe(key);
  }
  return stripePromise;
}

export async function startCheckout(priceId: string, mode: "payment" | "subscription") {
  const promoCode = priceId === import.meta.env.VITE_PRICE_MONTHLY ? "MBSINTRO10" : undefined;
  const { data }: any = await call("createCheckout", { priceId, mode, promoCode });
  if (!data?.sessionId) throw new Error("Billing unavailable (no sessionId).");
  const stripe = await getStripe();
  if (!stripe) throw new Error("Stripe unavailable");
  const result = await stripe.redirectToCheckout({ sessionId: data.sessionId });
  if (result.error) throw result.error;
}
