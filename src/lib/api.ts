import { auth } from "@/firebaseConfig";

const BASE = import.meta.env.VITE_FUNCTIONS_BASE_URL ?? "";

async function authedFetch(path: string, init?: RequestInit) {
  const token = await auth.currentUser?.getIdToken();
  return fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
      Authorization: token ? `Bearer ${token}` : "",
    },
  });
}

export async function startCreateScan(scanId: string) {
  return authedFetch("/createScan", { method: "POST", body: JSON.stringify({ scanId }) });
}

export async function openStripeCheckout(priceId: string, mode: "payment" | "subscription") {
  const r = await authedFetch(`/createCheckout?priceId=${encodeURIComponent(priceId)}&mode=${mode}`);
  const { url } = await r.json();
  // Open in same tab for smooth return
  window.location.href = url;
}

export { authedFetch };
