import { getIdToken } from "@/lib/authFacade";

const BASE = "/admin";

async function getToken(): Promise<string | undefined> {
  try {
    const token = await getIdToken();
    return token || undefined;
  } catch {
    return undefined;
  }
}

async function callAdmin<T>(
  path: string,
  body: Record<string, unknown> = {}
): Promise<T> {
  const token = await getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${BASE}/${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    credentials: "include",
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || `admin_error_${response.status}`);
  }
  return (await response.json()) as T;
}

export type AdminUserRecord = {
  uid: string;
  email: string | null;
  createdAt: string | null;
  lastLogin: string | null;
  credits: number | null;
  unlimitedClaim: boolean;
  unlimitedMirror: boolean;
};

export async function adminSearchUsers(
  query: string
): Promise<AdminUserRecord[]> {
  if (!query.trim()) return [];
  const data = await callAdmin<{ ok: boolean; users: AdminUserRecord[] }>(
    "users/search",
    { query }
  );
  return Array.isArray(data.users) ? data.users : [];
}

export async function adminGrantCredits(
  uid: string,
  amount: number
): Promise<void> {
  await callAdmin("users/grantCredits", { uid, amount });
}

export async function adminToggleUnlimited(
  uid: string,
  value: boolean
): Promise<void> {
  await callAdmin("users/toggleUnlimited", { uid, value });
}

export async function adminRefreshClaims(uid: string): Promise<void> {
  await callAdmin("users/refreshClaims", { uid });
}

export type StripeEventRecord = {
  id: string;
  type: string;
  created?: { _seconds: number; _nanoseconds: number } | number | string;
  uid?: string | null;
  email?: string | null;
  priceId?: string | null;
  amount?: number | null;
  status?: string | null;
  mode?: string | null;
};

export async function adminFetchStripeEvents(
  limit = 10
): Promise<StripeEventRecord[]> {
  const data = await callAdmin<{ ok: boolean; events: StripeEventRecord[] }>(
    "events/recent",
    { limit }
  );
  return Array.isArray(data.events) ? data.events : [];
}

export type TelemetryEventRecord = {
  id: string;
  createdAt?: { _seconds: number; _nanoseconds: number } | number | string;
  kind?: string | null;
  message?: string | null;
  code?: string | null;
  url?: string | null;
  component?: string | null;
};

export async function adminFetchTelemetry(
  limit = 50
): Promise<TelemetryEventRecord[]> {
  const data = await callAdmin<{ ok: boolean; events: TelemetryEventRecord[] }>(
    "telemetry/recent",
    { limit }
  );
  return Array.isArray(data.events) ? data.events : [];
}
