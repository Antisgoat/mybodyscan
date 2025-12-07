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

  try {
    const response = await apiFetch("/system/bootstrap", { method: "POST" });
    if (response.status === 404 || response.status === 405) {
      console.info("system_bootstrap_unavailable", { status: response.status });
      return null;
    }

    if (!response.ok) {
      const fallbackMessage = `HTTP ${response.status}`;
      const text = await response.text().catch(() => "");
      throw new Error(text || fallbackMessage);
    }

    const contentType = response.headers.get("Content-Type") || "";
    const payload = contentType.includes("application/json")
      ? await response.json().catch(() => null)
      : await response.text().catch(() => null);

    return payload && typeof payload === "object" ? (payload as BootstrapResponse) : null;
  } catch (error) {
    console.error("system_bootstrap_failed", error);
    throw error instanceof Error ? error : new Error("bootstrap_failed");
  }
}

export async function fetchSystemHealth(): Promise<any | null> {
  try {
    return await apiFetchJson("/system/health");
  } catch (error) {
    console.warn("system_health_unavailable", error);
    return null;
  }
}
