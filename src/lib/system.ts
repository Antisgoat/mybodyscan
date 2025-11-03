import { auth } from "@/lib/firebase";

const FUNCTIONS_ORIGIN = (import.meta.env.VITE_FUNCTIONS_ORIGIN ?? "").trim().replace(/\/$/, "");

type BootstrapResponse = {
  ok: boolean;
  admin: boolean;
  credits: number;
  claimsUpdated?: boolean;
};

export async function bootstrapSystem(): Promise<BootstrapResponse | null> {
  const user = auth.currentUser;
  if (!user || !FUNCTIONS_ORIGIN) return null;

  const token = await user.getIdToken();
  const response = await fetch(`${FUNCTIONS_ORIGIN}/system/bootstrap`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
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
  if (!FUNCTIONS_ORIGIN) return null;
  try {
    const response = await fetch(`${FUNCTIONS_ORIGIN}/system/health`);
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.warn("system_health_unavailable", error);
    return null;
  }
}
