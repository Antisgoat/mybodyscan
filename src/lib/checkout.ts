import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { toast } from "@/hooks/use-toast";
import { call } from "@/lib/callable";

type CheckoutError = Error & { handled?: boolean; code?: string };

let stripePromise: Promise<Stripe | null> | null = null;
let cachedKey: string | null = null;

function ensurePublishableKey(): string {
  const key = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
  if (!key) {
    toast({
      title: "Checkout unavailable",
      description: "Checkout unavailable — publishable key is missing.",
      variant: "destructive",
    });
    const error: CheckoutError = new Error("Checkout unavailable — publishable key is missing.");
    error.handled = true;
    error.code = "checkout_publishable_missing";
    throw error;
  }
  return key;
}

async function getStripeInstance(): Promise<Stripe> {
  const publishableKey = ensurePublishableKey();
  if (!stripePromise || cachedKey !== publishableKey) {
    cachedKey = publishableKey;
    stripePromise = loadStripe(publishableKey);
  }
  const stripe = await stripePromise;
  if (!stripe) {
    toast({
      title: "Checkout unavailable",
      description: "Checkout unavailable — Stripe.js failed to load.",
      variant: "destructive",
    });
    const error: CheckoutError = new Error("Checkout unavailable — Stripe.js failed to load.");
    error.handled = true;
    error.code = "stripe_load_failed";
    throw error;
  }
  return stripe;
}

export async function startCheckout(
  priceId: string,
  mode: "payment" | "subscription",
  couponCode?: string,
) {
  try {
    const stripe = await getStripeInstance();
    const payload = {
      priceId,
      mode,
      promoCode: couponCode?.trim() ? couponCode.trim() : undefined,
    };
    const response = await call<typeof payload, { sessionId?: string }>("createCheckout", payload);
    const sessionId = response?.data?.sessionId;
    if (!sessionId) {
      toast({
        title: "Checkout unavailable",
        description: "Checkout unavailable — no session returned.",
        variant: "destructive",
      });
      const error: CheckoutError = new Error("Checkout unavailable — no session returned.");
      error.handled = true;
      error.code = "checkout_session_missing";
      throw error;
    }

    const { error } = await stripe.redirectToCheckout({ sessionId });
    if (error) {
      toast({
        title: "Checkout unavailable",
        description: error.message || "Unable to redirect to checkout.",
        variant: "destructive",
      });
      const wrapped: CheckoutError = new Error(error.message || "stripe_redirect_failed");
      wrapped.handled = true;
      wrapped.code = error.code || "stripe_redirect_failed";
      throw wrapped;
    }
  } catch (err: any) {
    if (err?.handled) {
      throw err;
    }
    toast({
      title: "Checkout unavailable",
      description: err?.message || "Verifying your session. Please refresh and try again.",
      variant: "destructive",
    });
    throw err;
  }
}
