import { STRIPE_PUBLISHABLE_KEY } from "./flags";
import { ensureAppCheck, getAppCheckHeader } from "@/lib/appCheck";

type StripeLike = {
  redirectToCheckout: (opts: { sessionId: string }) => Promise<{ error?: { message?: string } }>;
};

let stripePromise: Promise<StripeLike | null> | null = null;

function loadStripeJs(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") return resolve();
    if (document.querySelector('script[src="https://js.stripe.com/v3"]')) return resolve();
    const s = document.createElement("script");
    s.src = "https://js.stripe.com/v3";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load Stripe.js"));
    document.head.appendChild(s);
  });
}

async function getStripe(): Promise<StripeLike | null> {
  if (!STRIPE_PUBLISHABLE_KEY) return null;
  if (typeof window === "undefined") return null;
  if (stripePromise) return stripePromise;
  stripePromise = (async () => {
    await loadStripeJs();
    const StripeCtor = (window as any).Stripe;
    if (typeof StripeCtor !== "function") return null;
    const inst = StripeCtor(STRIPE_PUBLISHABLE_KEY);
    return inst as StripeLike;
  })();
  return stripePromise;
}

/** Create a Checkout Session on the server and redirect. */
export async function startCheckout(payload?: Record<string, unknown>): Promise<boolean> {
  try {
    const stripe = await getStripe();
    if (!stripe) {
      console.warn("[stripe] publishable key missing or Stripe.js unavailable");
      return false;
    }
    await ensureAppCheck();
    const appCheckHeaders = await getAppCheckHeader();
    const res = await fetch("/api/billing/create-checkout-session", {
      method: "POST",
      headers: { "content-type": "application/json", ...(appCheckHeaders || {}) },
      body: JSON.stringify(payload || {}),
    });
    if (!res.ok) {
      console.warn("[stripe] checkout session failed:", res.status);
      return false;
    }
    const j = await res.json().catch(() => ({}));
    const sessionId = String(j?.id || j?.sessionId || "");
    if (!sessionId) {
      console.warn("[stripe] no sessionId in response");
      return false;
    }
    const out = await stripe.redirectToCheckout({ sessionId });
    if (out?.error) console.warn("[stripe] redirect error:", out.error.message);
    return true;
  } catch (e) {
    console.warn("[stripe] checkout error:", e);
    return false;
  }
}

/** Ask server for a Billing Portal URL and navigate there. */
export async function openBillingPortal(): Promise<boolean> {
  try {
    const stripe = await getStripe();
    if (!stripe) {
      console.warn("[stripe] publishable key missing or Stripe.js unavailable");
      return false;
    }
    await ensureAppCheck();
    const appCheckHeaders = await getAppCheckHeader();
    const res = await fetch("/api/billing/portal-session", {
      method: "POST",
      headers: { "content-type": "application/json", ...(appCheckHeaders || {}) },
      body: JSON.stringify({}),
    });
    if (!res.ok) {
      console.warn("[stripe] portal session failed:", res.status);
      return false;
    }
    const j = await res.json().catch(() => ({}));
    const url = String(j?.url || "");
    if (!url) {
      console.warn("[stripe] no portal url in response");
      return false;
    }
    window.location.href = url;
    return true;
  } catch (e) {
    console.warn("[stripe] portal error:", e);
    return false;
  }
}

/** Utility for UI to decide visibility/enabled state. */
export function isStripeEnabled(): boolean {
  return Boolean(STRIPE_PUBLISHABLE_KEY);
}
