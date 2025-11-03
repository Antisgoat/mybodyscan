import { apiFetch } from "@/lib/api";
import { fnUrl } from "@/lib/env";
import { auth } from "@/lib/firebase";

type BootstrapResponse = {
  ok: boolean;
  admin: boolean;
  credits: number;
  claimsUpdated?: boolean;
};

export async function bootstrapSystem(): Promise<BootstrapResponse | null> {
  const user = auth.currentUser;
  if (!user) return null;

  const token = await user.getIdToken();
  const endpoint = fnUrl("/system/bootstrap");
  if (!endpoint) return null;
  const response = await apiFetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    console.error("system_bootstrap_failed", payload);
    throw new Error(typeof payload?.error === "string" ? payload.error : "bootstrap_failed");
  }
  return payload as BootstrapResponse;
}

export async function fetchSystemHealth(): Promise<any | null> {
  const endpoint = fnUrl("/system/health");
  if (!endpoint) return null;
  try {
    const response = await apiFetch(endpoint);
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.warn("system_health_unavailable", error);
    return null;
  }
}
