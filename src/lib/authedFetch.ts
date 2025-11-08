import { getAuth } from "firebase/auth";
import { apiFetchJson } from "@/lib/apiFetch";

export type AuthedJsonOptions = {
  signal?: AbortSignal;
};

export async function authedJsonPost<T>(path: string, body: unknown, options: AuthedJsonOptions = {}): Promise<T> {
  const auth = getAuth();
  const user = auth.currentUser;
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
