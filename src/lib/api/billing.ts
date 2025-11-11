import { getIdToken } from "firebase/auth";
import { getToken as getAppCheckToken } from "firebase/app-check";
import { auth, appCheck } from "@/lib/firebase";

export type CheckoutMode = "payment" | "subscription";

export function buildCheckoutHeaders(idToken?: string, appCheckToken?: string) {
  return {
    "Content-Type": "application/json",
    ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
    ...(appCheckToken ? { "X-Firebase-AppCheck": appCheckToken } : {}),
  };
}

export async function startCheckout(priceId: string, mode: CheckoutMode = "subscription"): Promise<URL | null> {
  const user = auth.currentUser;
  const idToken = user ? await getIdToken(user, /*forceRefresh*/ false) : "";
  const appCheckInstance = appCheck ?? null;
  const ac = appCheckInstance
    ? await getAppCheckToken(appCheckInstance, /*forceRefresh*/ false).catch(() => null)
    : null;
  const headers = buildCheckoutHeaders(idToken, ac?.token);

  const res = await fetch("/api/billing/create-checkout-session", {
    method: "POST",
    headers,
    body: JSON.stringify({ priceId, mode }),
  });

  if (!res.ok) {
    // Surface server error text to help debug in UAT
    const text = await res.text().catch(() => "");
    throw new Error(`Checkout failed (${res.status}): ${text || "no body"}`);
  }

  const data = await res.json().catch(() => ({} as any));
  const url = data?.url;
  if (typeof url !== "string" || !url.startsWith("http")) return null;

  try {
    return new URL(url);
  } catch {
    return null;
  }
}
