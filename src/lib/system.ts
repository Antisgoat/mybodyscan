import { apiFetch } from "@/lib/apiFetch";
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
  try {
    return (await apiFetch("/system/bootstrap", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })) as BootstrapResponse;
  } catch (error) {
    console.error("system_bootstrap_failed", error);
    throw error instanceof Error ? error : new Error("bootstrap_failed");
  }
}

export async function fetchSystemHealth(): Promise<any | null> {
  try {
    return await apiFetch("/system/health");
  } catch (error) {
    console.warn("system_health_unavailable", error);
    return null;
  }
}
