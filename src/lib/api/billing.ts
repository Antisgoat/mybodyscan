import { apiPost } from "@/lib/http";
import { resolveFunctionUrl } from "@/lib/api/functionsBase";

export type CheckoutMode = "payment" | "subscription";

export async function startCheckout(
  priceId: string,
  mode: CheckoutMode = "subscription",
): Promise<{ sessionId: string | null; url: string | null }> {
  const endpoint = resolveFunctionUrl("VITE_CHECKOUT_URL", "createCheckout");
  const data = await apiPost<{ sessionId?: string; url?: string }>(endpoint, { priceId, mode });
  const sessionId = typeof data?.sessionId === "string" ? data.sessionId : null;
  const url = typeof data?.url === "string" ? data.url : null;
  return { sessionId, url };
}
