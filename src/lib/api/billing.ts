import { apiFetchWithFallback } from "@/lib/http";
import { resolveFunctionUrl } from "@/lib/api/functionsBase";

export type CheckoutMode = "payment" | "subscription";

export async function startCheckout(priceId: string, mode: CheckoutMode = "subscription"): Promise<URL | null> {
  const endpoint = resolveFunctionUrl("VITE_CHECKOUT_URL", "createCheckout");
  const data = await apiFetchWithFallback<{ url?: string }>("createCheckout", endpoint, { method: "POST", body: { priceId, mode } });
  const url = data?.url;
  if (typeof url !== "string" || !url.startsWith("http")) return null;

  try {
    return new URL(url);
  } catch {
    return null;
  }
}
