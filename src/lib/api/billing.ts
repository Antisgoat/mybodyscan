import { apiPost } from "@/lib/http";

export type CheckoutMode = "payment" | "subscription";

function getCheckoutUrl(): string {
  const env = (import.meta as any).env || {};
  return (
    env.VITE_CHECKOUT_URL ||
    "/api/billing/create-checkout-session" ||
    "/api/createCheckout"
  );
}

export async function startCheckout(priceId: string, mode: CheckoutMode = "subscription"): Promise<URL | null> {
  const data = await apiPost<{ url?: string }>(getCheckoutUrl(), { priceId, mode });
  const url = data?.url;
  if (typeof url !== "string" || !url.startsWith("http")) return null;

  try {
    return new URL(url);
  } catch {
    return null;
  }
}
