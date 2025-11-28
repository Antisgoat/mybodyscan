import { apiPost } from "@/lib/http";
import { resolveFunctionUrl } from "@/lib/api/functionsBase";

export async function createCustomerPortalSession(): Promise<string> {
  const endpoint = resolveFunctionUrl("VITE_PORTAL_URL", "createCustomerPortal");
  const data = (await apiPost(endpoint, {})) as any;
  const url = data?.url;
  if (!url || typeof url !== "string") throw new Error("No portal URL returned");
  return url;
}
