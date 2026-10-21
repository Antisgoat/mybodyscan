import { httpsCallable } from "firebase/functions";
import { ensureAppCheck, getAppCheckTokenHeader } from "@/lib/appCheck";
import { requireIdToken } from "@/auth/mbs-auth";
import { functions } from "@/lib/firebase";
import { fetchJson } from "@/lib/backend/fetchJson";
import { isCapacitorNative } from "@/lib/platform/isNative";
import {
  requestFunctionPath,
  unwrapRequestFunctionResponse,
} from "@/lib/backend/legacyRequestRoute";

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
  options?: {
    method?: "GET" | "POST";
    timeoutMs?: number;
    preparationTimeoutMs?: number;
    headers?: Record<string, string>;
  }
): Promise<TRes> {
  const method = options?.method ?? "POST";
  const prepare = async () => {
    await ensureAppCheck();
    const token = await requireIdToken();
    const appCheck = await getAppCheckTokenHeader();
    return { token, appCheck };
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const prepared = prepare();
  const { token, appCheck } = await (options?.preparationTimeoutMs
    ? Promise.race([
        prepared,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new Error(
                  "Connection took too long. Check your connection and try again."
                )
              ),
            options.preparationTimeoutMs
          );
        }),
      ]).finally(() => {
        if (timer) clearTimeout(timer);
      })
    : prepared);
  const response = await fetchJson<unknown>(
    requestFunctionPath(name, isCapacitorNative()),
    {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...appCheck,
        ...(options?.headers ?? {}),
      },
      ...(method === "POST" ? { body: JSON.stringify(body ?? {}) } : {}),
    },
    options?.timeoutMs ?? 15000
  );
  return unwrapRequestFunctionResponse<TRes>(name, response);
}

export async function backendHealthCheck(
  timeoutMs = 2500
): Promise<{ ok: boolean }> {
  return fetchJson<{ ok: boolean }>("/health", { method: "GET" }, timeoutMs);
}
