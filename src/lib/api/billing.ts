import { apiPost } from "@/lib/http";

export type CheckoutMode = "payment" | "subscription";

export async function startCheckout(priceId: string, mode: CheckoutMode = "subscription"): Promise<URL | null> {
  const data = await apiPost<{ url?: string }>("/api/billing/create-checkout-session", { priceId, mode });
  const url = data?.url;
  if (typeof url !== "string" || !url.startsWith("http")) return null;

  try {
    return new URL(url);
  } catch {
    return null;
  }
}
