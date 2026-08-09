import { apiFetchJson } from "@/lib/apiFetch";

export type WhoopConnectionStatus = {
  ok: true;
  configured: boolean;
  connected: boolean;
  connectedAtMs: number | null;
  lastSyncedAtMs: number | null;
};

export type WhoopRecovery = {
  date: string;
  recoveryScore: number | null;
  restingHeartRate: number | null;
  hrvRmssdMs: number | null;
  source: "whoop";
};

export function getWhoopStatus(): Promise<WhoopConnectionStatus> {
  return apiFetchJson("/health/whoop/status", { method: "GET" });
}

export async function startWhoopConnection(): Promise<string> {
  const response = await apiFetchJson<{
    ok: true;
    authorizationUrl: string;
  }>("/health/whoop/start", { method: "POST" });
  if (!response.authorizationUrl.startsWith("https://api.prod.whoop.com/")) {
    throw new Error("Invalid WHOOP authorization URL.");
  }
  return response.authorizationUrl;
}

export function syncWhoopRecovery(): Promise<{
  ok: true;
  recovery: WhoopRecovery | null;
  lastSyncedAtMs: number;
}> {
  return apiFetchJson("/health/whoop/sync", { method: "POST" });
}

export function disconnectWhoop(): Promise<{ ok: true; connected: false }> {
  return apiFetchJson("/health/whoop/disconnect", { method: "POST" });
}
