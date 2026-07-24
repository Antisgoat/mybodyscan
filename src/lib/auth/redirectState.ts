import { sanitizeReturnTo } from "@/lib/returnTo";

const RETURN_PATH_STORAGE_KEY = "mybodyscan:auth:return";

export function rememberAuthRedirect(path: string) {
  if (typeof window === "undefined") return;
  const safePath = sanitizeReturnTo(path);
  if (!safePath) return;
  try {
    sessionStorage.setItem(RETURN_PATH_STORAGE_KEY, safePath);
  } catch (err) {
    if (import.meta.env.DEV) {
      console.warn("[auth] Unable to persist redirect target:", err);
    }
  }
}

export function consumeAuthRedirect(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = sessionStorage.getItem(RETURN_PATH_STORAGE_KEY);
    if (stored) {
      sessionStorage.removeItem(RETURN_PATH_STORAGE_KEY);
      return sanitizeReturnTo(stored);
    }
  } catch (err) {
    if (import.meta.env.DEV) {
      console.warn("[auth] Unable to read redirect target:", err);
    }
  }
  return null;
}
