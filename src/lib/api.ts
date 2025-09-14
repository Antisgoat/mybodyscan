import { auth, app } from "@/lib/firebase";
import { getFunctions, httpsCallable } from "firebase/functions";
import { getEnv } from "./env";

const BASE = getEnv("VITE_FUNCTIONS_BASE_URL");
if (!BASE && import.meta.env.DEV) {
  console.warn("VITE_FUNCTIONS_BASE_URL not set; API calls will fail");
}

async function authedFetch(path: string, init?: RequestInit) {
  if (!BASE) throw new Error("Functions URL not configured");
  const t = await auth.currentUser?.getIdToken();
  if (!t) throw new Error("Authentication required");
  return fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${t}`,
      ...(init?.headers || {}),
    },
  });
}

export async function startScan(params: { filename: string; size: number; contentType: string }) {
  const functions = getFunctions(app);
  const fn = httpsCallable(functions, "startScan");
  const { data } = await fn(params);
  return data as { scanId: string; remaining: number };
}

function isValidCheckoutUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.hostname === 'checkout.stripe.com';
  } catch {
    return false;
  }
}

export async function openStripeCheckout(priceId: string, plan: string, mode: "payment" | "subscription") {
  const r = await authedFetch(`/createCheckout?priceId=${encodeURIComponent(priceId)}&plan=${encodeURIComponent(plan)}&mode=${mode}`);
  const { url } = await r.json();
  if (url && isValidCheckoutUrl(url)) {
    window.location.href = url;
  } else {
    throw new Error('Invalid checkout URL received');
  }
}

export async function openStripeCheckoutByProduct(productId: string) {
  const r = await authedFetch(`/createCheckout?priceId=${encodeURIComponent(productId)}`);
  const { url } = await r.json();
  if (url && isValidCheckoutUrl(url)) {
    window.location.href = url;
  } else {
    throw new Error('Invalid checkout URL received');
  }
}

export async function openStripePortal() {
  const r = await authedFetch(`/createCustomerPortal`);
  const { url } = await r.json();
  if (url) window.open(url, "_blank", "noopener,noreferrer");
}
export async function startCheckout(plan: "annual"|"monthly"|"pack5"|"pack3"|"single") {
  const functions = getFunctions(app);
  const createCheckoutSession = httpsCallable(functions, "createCheckoutSession");
  const { data } = await createCheckoutSession({ plan });
  const { url } = data as { id: string; url: string };
  if (url && isValidCheckoutUrl(url)) {
    window.location.assign(url);
  } else {
    throw new Error('Invalid checkout URL received');
  }
}

export { authedFetch, BASE as FUNCTIONS_BASE_URL };
