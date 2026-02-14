import { httpsCallable } from "firebase/functions";
import { ensureAppCheck, getAppCheckTokenHeader } from "@/lib/appCheck";
import { requireIdToken } from "@/auth/mbs-auth";
import { functions } from "@/lib/firebase";
import { fetchJson } from "@/lib/backend/fetchJson";

export async function callCallable<TReq = unknown, TRes = unknown>(
  name: string,
  data?: TReq
): Promise<TRes> {
  await ensureAppCheck();
  const fn = httpsCallable<TReq, TRes>(functions, name);
  const result = await fn((data ?? {}) as TReq);
  return result.data as TRes;
}

export async function callRequestFunction<TRes = unknown>(
  name: string,
  body: unknown = {},
  options?: { method?: "GET" | "POST"; timeoutMs?: number; headers?: Record<string, string> }
): Promise<TRes> {
  const method = options?.method ?? "POST";
  await ensureAppCheck();
  const token = await requireIdToken();
  const appCheck = await getAppCheckTokenHeader();
  return fetchJson<TRes>(`/api/${name}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...appCheck,
      ...(options?.headers ?? {}),
    },
    ...(method === "POST" ? { body: JSON.stringify(body ?? {}) } : {}),
  }, options?.timeoutMs ?? 15000);
}

export async function backendHealthCheck(timeoutMs = 2500): Promise<{ ok: boolean }> {
  return fetchJson<{ ok: boolean }>("/api/health", { method: "GET" }, timeoutMs);
}

