import { auth, app } from "@/lib/firebase";
import { getFunctions, httpsCallable } from "firebase/functions";
import { toast } from "@/hooks/use-toast";
import { fnUrl } from "@/lib/env";

async function authedFetch(path: string, init?: RequestInit) {
  const url = fnUrl(path);
  if (!url) {
    toast({ title: "Server not configured" });
    return new Response(null, { status: 503 });
  }
  const t = await auth.currentUser?.getIdToken();
  if (!t) throw new Error("Authentication required");
  return fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${t}`,
      ...(init?.headers || {}),
    },
  });
}

export async function startScan(params: {
  filename: string;
  size: number;
  contentType: string;
}) {
  const functions = getFunctions(app);
  const fn = httpsCallable(functions, "startScan");
  const { data } = await fn(params);
  return data as { scanId: string };
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

async function handleJsonResponse(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

export async function beginPaidScan(payload: {
  scanId: string;
  hashes: string[];
  gateScore: number;
  mode: "2" | "4";
}) {
  const response = await authedFetch(`/beginPaidScan`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  const data = await handleJsonResponse(response);
  if (!response.ok) {
    const message = data?.error || data?.reason || "authorization_failed";
    throw new Error(message);
  }
  return data as { ok: boolean; remainingCredits?: number };
}

export async function recordGateFailure() {
  const response = await authedFetch(`/recordGateFailure`, { method: "POST" });
  const data = await handleJsonResponse(response);
  if (!response.ok) {
    throw new Error(data?.error || "gate_failure_not_recorded");
  }
  return data as { ok: boolean; remainingAttempts?: number };
}

export async function refundIfNoResult(scanId: string) {
  const response = await authedFetch(`/refundIfNoResult`, {
    method: "POST",
    body: JSON.stringify({ scanId }),
  });
  const data = await handleJsonResponse(response);
  if (!response.ok) {
    throw new Error(data?.error || "refund_failed");
  }
  return data as { ok: boolean };
}
export { authedFetch };
