import { auth, app } from "@/lib/firebase";
import { getFunctions, httpsCallable } from "firebase/functions";
import { toast } from "@/hooks/use-toast";

const BASE = import.meta.env.VITE_FUNCTIONS_BASE_URL as string | undefined;

async function authedFetch(path: string, init?: RequestInit) {
  const base = import.meta.env.VITE_FUNCTIONS_BASE_URL as string | undefined;
  if (!base) {
    toast({ title: "Server not configured" });
    return new Response(null, { status: 503 });
  }
  const t = await auth.currentUser?.getIdToken();
  if (!t) throw new Error("Authentication required");
  return fetch(`${base}${path}`, {
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

export async function openStripeCheckout(priceId: string, plan: string, mode: "payment" | "subscription") {
  const r = await authedFetch(`/createCheckout?priceId=${encodeURIComponent(priceId)}&plan=${encodeURIComponent(plan)}&mode=${mode}`);
  const { url } = await r.json();
  if (url) window.location.href = url;
}

export async function openStripeCheckoutByProduct(productId: string) {
  const r = await authedFetch(`/createCheckout?priceId=${encodeURIComponent(productId)}`);
  const { url } = await r.json();
  if (url) window.location.href = url;
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
  window.location.assign(url);
}

export { authedFetch, BASE as FUNCTIONS_BASE_URL };
