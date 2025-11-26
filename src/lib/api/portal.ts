import { apiFetch } from "@/lib/http";
import { resolveFunctionUrl } from "@/lib/api/functionsBase";

function apiBase(): string {
  return resolveFunctionUrl("VITE_API_BASE_URL", "api");
}

export async function createCustomerPortalSession(): Promise<string> {
  const endpoint = `${apiBase().replace(/\/$/, "")}/billing/portal`;
  const data = (await apiFetch(endpoint, { method: "POST", body: {} })) as any;
  const url = data?.url;
  if (!url || typeof url !== "string") throw new Error("No portal URL returned");
  return url;
}
