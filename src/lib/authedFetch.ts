import { apiFetchJson } from "@/lib/apiFetch";
import { auth } from "@/lib/firebase";

export type AuthedJsonOptions = {
  signal?: AbortSignal;
};

export async function authedJsonPost<T>(
  path: string,
  body: unknown,
  options: AuthedJsonOptions = {}
): Promise<T> {
  const user = auth?.currentUser ?? null;
  const idToken = user ? await user.getIdToken() : null;
  const headers = new Headers({ "Content-Type": "application/json" });
  if (idToken) {
    headers.set("Authorization", `Bearer ${idToken}`);
  }

  const payload = await apiFetchJson(path, {
    method: "POST",
    headers,
    body: JSON.stringify(body ?? {}),
    signal: options.signal,
  });

  return payload as T;
}
