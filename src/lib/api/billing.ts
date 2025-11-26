import { apiFetch } from "@/lib/http";
import { resolveFunctionUrl } from "@/lib/api/functionsBase";

export type CheckoutMode = "payment" | "subscription";

function apiBase(): string {
  return resolveFunctionUrl("VITE_API_BASE_URL", "api");
}

export async function startCheckout(
  priceId: string,
  mode: CheckoutMode = "subscription",
): Promise<{ sessionId: string | null; url: string | null }> {
  const endpoint = `${apiBase().replace(/\/$/, "")}/billing/create-checkout-session`;
  const data = await apiFetch<{ sessionId?: string; url?: string }>(endpoint, {
    method: "POST",
    body: { priceId, mode },
  });
  const sessionId = typeof data?.sessionId === "string" ? data.sessionId : null;
  const url = typeof data?.url === "string" ? data.url : null;
  return { sessionId, url };
}
