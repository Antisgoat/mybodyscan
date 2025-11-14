import { apiFetch } from "@/lib/http";

export async function createCustomerPortalSession(): Promise<string> {
  const data = (await apiFetch("/api/createCustomerPortal", { method: "POST", body: {} })) as any;
  const url = data?.url;
  if (!url || typeof url !== "string") throw new Error("No portal URL returned");
  return url;
}
