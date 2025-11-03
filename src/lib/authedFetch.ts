import { getAuth } from "firebase/auth";
import { ensureAppCheck, getAppCheckHeader } from "@/lib/appCheck";

export type AuthedJsonOptions = {
  signal?: AbortSignal;
};

async function resolveAppCheckToken(): Promise<string | null> {
  try {
    await ensureAppCheck();
    const header = await getAppCheckHeader();
    const token = header?.["X-Firebase-AppCheck"];
    return typeof token === "string" && token.length > 0 ? token : null;
  } catch {
    return null;
  }
}

export async function authedJsonPost<T>(path: string, body: unknown, options: AuthedJsonOptions = {}): Promise<T> {
  const auth = getAuth();
  const user = auth.currentUser;
  const idToken = user ? await user.getIdToken() : null;
  const appCheckToken = await resolveAppCheckToken();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (idToken) {
    headers.Authorization = `Bearer ${idToken}`;
  }
  if (appCheckToken) {
    headers["X-Firebase-AppCheck"] = appCheckToken;
  }

  const response = await fetch(path, {
    method: "POST",
    headers,
    body: JSON.stringify(body ?? {}),
    credentials: "include",
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
