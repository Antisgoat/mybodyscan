import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { FirebaseError } from "firebase/app";
import { toast } from "@/hooks/use-toast";
import { call } from "./callable";

type CheckoutError = Error & { handled?: boolean; code?: string };

let stripePromise: Promise<Stripe | null> | null = null;
let cachedKey: string | null = null;

function ensurePublishableKey(): string {
  const key = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
  if (!key) {
    toast({
      title: "Checkout unavailable",
      description: "Checkout unavailable — missing publishable key",
      variant: "destructive",
    });
    const error: CheckoutError = new Error("Checkout unavailable — missing publishable key");
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
      description: "Checkout unavailable — Stripe failed to load.",
      variant: "destructive",
    });
    const error: CheckoutError = new Error("Checkout unavailable — Stripe failed to load.");
    error.handled = true;
    error.code = "stripe_load_failed";
    throw error;
  }
  return stripe;
}

export async function startCheckout(priceId: string, mode: "payment" | "subscription") {
  try {
    ensurePublishableKey();
    const promoCode = priceId === import.meta.env.VITE_PRICE_MONTHLY ? "MBSINTRO10" : undefined;
    const { data }: { data: { sessionId?: string } } = await call("createCheckout", { priceId, mode, promoCode });
    const sessionId = typeof data?.sessionId === "string" ? data.sessionId : "";
    if (!sessionId) {
      toast({
        title: "Checkout unavailable",
        description: "Checkout unavailable — missing checkout session.",
        variant: "destructive",
      });
      const error: CheckoutError = new Error("Checkout unavailable — missing checkout session.");
      error.handled = true;
      error.code = "checkout_session_missing";
      throw error;
    }

    const stripe = await getStripeInstance();
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
    const firebaseErr = err instanceof FirebaseError ? err : null;
    if (firebaseErr?.code === "app_check_required" || err?.code === "app_check_required") {
      toast({
        title: "Checkout unavailable",
        description: "Verifying your session. Please refresh and try again.",
        variant: "destructive",
      });
      const wrapped: CheckoutError = new Error("Verifying your session. Please refresh and try again.");
      wrapped.handled = true;
      wrapped.code = "app_check_required";
      throw wrapped;
    }
    throw err;
  }
}
