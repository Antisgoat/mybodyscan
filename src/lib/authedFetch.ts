import { getAuth } from "firebase/auth";
import { apiFetch } from "@/lib/api";

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

  const response = await apiFetch(path, {
    method: "POST",
    headers,
    body: JSON.stringify(body ?? {}),
    signal: options.signal,
  });

  const text = await response.text().catch(() => "");
  if (!response.ok) {
    const error = new Error(`HTTP_${response.status}_${text}`.slice(0, 200));
    (error as any).status = response.status;
    (error as any).body = text;
    throw error;
  }

  if (!text) {
    return undefined as T;
  }

  try {
    return JSON.parse(text) as T;
  } catch (error) {
    const parseError = new Error("invalid_json");
    (parseError as any).cause = error;
    throw parseError;
  }
}
