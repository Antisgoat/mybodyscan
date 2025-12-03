import { call } from "@/lib/callable";

export type CheckoutMode = "payment" | "subscription";

export async function startCheckout(
  priceId: string,
  mode: CheckoutMode = "subscription",
): Promise<{ sessionId: string | null; url: string | null }> {
  const response = await call<{ priceId: string; mode: CheckoutMode }, { sessionId?: string; url?: string }>(
    "createCheckout",
    { priceId, mode },
  );
  const data = response?.data ?? response;
  const sessionId = typeof (data as any)?.sessionId === "string" ? (data as any).sessionId : null;
  const url = typeof (data as any)?.url === "string" ? (data as any).url : null;
  return { sessionId, url };
}
