import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { toast } from "@/hooks/use-toast";
import { backend } from "@/lib/backendBridge";

type CheckoutError = Error & { handled?: boolean; code?: string };

let stripePromise: Promise<Stripe | null> | null = null;
let cachedKey: string | null = null;

function ensurePublishableKey(): string {
  const key = (import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || "").trim();
  if (!key) {
    toast({
      title: "Checkout unavailable",
      description: "Checkout unavailable — publishable key is missing.",
      variant: "destructive",
    });
    const error: CheckoutError = new Error("Checkout unavailable — missing publishable key.");
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
  promoCode?: string,
) {
  const stripe = await getStripeInstance();
  const payload = {
    priceId,
    mode,
    promoCode: promoCode?.trim() ? promoCode.trim() : undefined,
  };

  let sessionId: string | undefined;
  try {
    const response = await backend.createCheckout(payload);
    sessionId = response?.sessionId;
  } catch (err: any) {
    const fallbackAttempted = Boolean(err?.httpFallbackAttempted);
    const message = fallbackAttempted
      ? "Checkout unavailable — callable and HTTP fallback failed."
      : err?.message || "Checkout unavailable — backend request failed.";
    toast({ title: "Checkout unavailable", description: message, variant: "destructive" });
    const wrapped: CheckoutError = new Error(message);
    wrapped.handled = true;
    wrapped.code = fallbackAttempted ? "checkout_http_fallback_failed" : err?.code || "checkout_backend_failed";
    throw wrapped;
  }

  if (!sessionId) {
    toast({
      title: "Checkout unavailable",
      description: "Checkout unavailable — no session returned.",
      variant: "destructive",
    });
    const error: CheckoutError = new Error("Checkout unavailable — no sessionId.");
    error.handled = true;
    error.code = "checkout_session_missing";
    throw error;
  }

  const { error } = await stripe.redirectToCheckout({ sessionId });
  if (error) {
    const description = error.message || "Unable to redirect to checkout.";
    toast({ title: "Checkout unavailable", description, variant: "destructive" });
    const wrapped: CheckoutError = new Error(description);
    wrapped.handled = true;
    wrapped.code = error.code || "stripe_redirect_failed";
    throw wrapped;
  }
}
