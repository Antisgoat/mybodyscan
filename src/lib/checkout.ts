import { loadStripe } from "@stripe/stripe-js";
import { httpsCallable } from "firebase/functions";
import { toast } from "@/hooks/use-toast";
import { functions } from "@/lib/firebase";
import { apiFetch } from "@/lib/apiFetch";

export async function startCheckout(
  priceId: string,
  mode: "payment" | "subscription",
  promoCode?: string
) {
  const publishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
  if (!publishableKey) {
    toast({
      title: "Checkout unavailable",
      description: "Missing Stripe publishable key.",
      variant: "destructive",
    });
    throw new Error("Checkout unavailable — missing publishable key.");
  }
  const stripe = await loadStripe(publishableKey);
  if (!stripe) {
    toast({
      title: "Checkout unavailable",
      description: "Stripe.js failed to load.",
      variant: "destructive",
    });
    throw new Error("Checkout unavailable — Stripe.js failed to load.");
  }

  let sessionId = "";
  try {
    const callable = httpsCallable(functions, "createCheckout");
    const response: any = await callable({ priceId, mode, promoCode });
    sessionId = response?.data?.sessionId || "";
  } catch (error) {
    try {
      const resp = await apiFetch("/api/createCheckout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId, mode, promoCode }),
      });
      if (resp.ok) {
        const data = await resp.json().catch(() => ({}));
        sessionId = data?.sessionId || "";
      }
    } catch (fallbackError) {
      console.error("checkout.callable_failed", error);
      console.error("checkout.http_failed", fallbackError);
    }
  }

  if (!sessionId) {
    toast({
      title: "Checkout unavailable",
      description: "Could not create Stripe session.",
      variant: "destructive",
    });
    throw new Error("Checkout unavailable — could not create session.");
  }

  const { error } = await stripe.redirectToCheckout({ sessionId });
  if (error) {
    toast({
      title: "Checkout unavailable",
      description: error.message || "Redirect failed.",
      variant: "destructive",
    });
    throw error;
  }
}
