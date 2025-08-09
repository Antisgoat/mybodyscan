import { auth } from "@/firebaseConfig";

const BASE = import.meta.env.VITE_FUNCTIONS_BASE_URL ?? "";

async function authedFetch(path: string, init?: RequestInit) {
  if (!BASE) throw new Error("Functions URL not configured");
  const t = await auth.currentUser?.getIdToken();
  return fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` }
  });
}

export async function startCreateScan(scanId: string) {
  const r = await authedFetch("/createScan", {
    method: "POST",
    body: JSON.stringify({ scanId })
  });
  if (!r.ok) throw new Error(`createScan failed: ${r.status}`);
  return r.json();
}

export async function openStripeCheckout(priceId: string, mode: "payment" | "subscription") {
  const r = await authedFetch(`/createCheckout?priceId=${encodeURIComponent(priceId)}&mode=${mode}`);
  const { url } = await r.json();
  if (url) window.location.href = url;
}

export { authedFetch, BASE as FUNCTIONS_BASE_URL };
