import { apiFetchJson } from "@/lib/apiFetch";
import { requireIdToken } from "@/auth/client";

export type AuthedJsonOptions = {
  signal?: AbortSignal;
};

export async function authedJsonPost<T>(
  path: string,
  body: unknown,
  options: AuthedJsonOptions = {}
): Promise<T> {
  const idToken = await requireIdToken();
  const headers = new Headers({ "Content-Type": "application/json" });
  headers.set("Authorization", `Bearer ${idToken}`);

  const payload = await apiFetchJson(path, {
    method: "POST",
    headers,
    body: JSON.stringify(body ?? {}),
    signal: options.signal,
  });

  return payload as T;
}
