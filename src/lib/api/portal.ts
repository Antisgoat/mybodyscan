import { apiFetchWithFallback } from "@/lib/http";
import { preferRewriteUrl } from "@/lib/api/urls";

export async function createCustomerPortalSession(): Promise<string> {
  const endpoint = preferRewriteUrl("createCustomerPortal");
  const data = (await apiFetchWithFallback("createCustomerPortal", endpoint, { method: "POST", body: {} })) as any;
  const url = data?.url;
  if (!url || typeof url !== "string") throw new Error("No portal URL returned");
  return url;
}
