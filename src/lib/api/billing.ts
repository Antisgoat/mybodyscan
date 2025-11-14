import { apiFetchWithFallback } from "@/lib/http";
import { preferRewriteUrl } from "@/lib/api/urls";

export type CheckoutMode = "payment" | "subscription";

function getCheckoutUrl(): string {
  const env = (import.meta as any).env || {};
  const override = env.VITE_CHECKOUT_URL;
  return override && typeof override === "string" && override.trim().length > 0
    ? override
    : preferRewriteUrl("createCheckout");
}

export async function startCheckout(priceId: string, mode: CheckoutMode = "subscription"): Promise<URL | null> {
  const endpoint = getCheckoutUrl();
  const data = await apiFetchWithFallback<{ url?: string }>("createCheckout", endpoint, { method: "POST", body: { priceId, mode } });
  const url = data?.url;
  if (typeof url !== "string" || !url.startsWith("http")) return null;

  try {
    return new URL(url);
  } catch {
    return null;
  }
}
