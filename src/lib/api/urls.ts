const PROJECT = (import.meta as any).env?.VITE_FIREBASE_PROJECT_ID || "mybodyscan-f3daf";
const REGION = "us-central1";

type Key =
  | "systemHealth"
  | "coachChat"
  | "nutritionSearch"
  | "createCheckout"
  | "createCustomerPortal"
  | "deleteAccount";

const REWRITE_PATH: Record<Key, string> = {
  systemHealth: "/api/system/health",
  coachChat: "/api/coach/chat",
  nutritionSearch: "/api/nutrition/search",
  createCheckout: "/api/createCheckout",
  createCustomerPortal: "/api/createCustomerPortal",
  deleteAccount: "/api/account/delete",
};

const DIRECT_FN: Record<Key, string> = {
  systemHealth:        `https://${REGION}-${PROJECT}.cloudfunctions.net/systemHealth`,
  coachChat:           `https://${REGION}-${PROJECT}.cloudfunctions.net/coachChat`,
  nutritionSearch:     `https://${REGION}-${PROJECT}.cloudfunctions.net/nutritionSearch`,
  createCheckout:      `https://${REGION}-${PROJECT}.cloudfunctions.net/createCheckout`,
  createCustomerPortal:`https://${REGION}-${PROJECT}.cloudfunctions.net/createCustomerPortal`,
  deleteAccount:       `https://${REGION}-${PROJECT}.cloudfunctions.net/deleteAccount`,
};

function storage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

function cacheKey(k: Key) { return `mbs_url_${k}`; }

export function preferRewriteUrl(k: Key): string {
  const store = storage();
  const cached = store?.getItem(cacheKey(k));
  if (cached) return cached;
  return REWRITE_PATH[k];
}

export function noteWorkingUrl(k: Key, url: string) {
  const store = storage();
  try { store?.setItem(cacheKey(k), url); } catch {}
}

export function fallbackDirectUrl(k: Key): string {
  return DIRECT_FN[k];
}

export function looksLikeHtml(body: string, contentType?: string | null): boolean {
  if (contentType && contentType.includes("text/html")) return true;
  const s = body.trim().slice(0, 200).toLowerCase();
  return s.startsWith("<!doctype") || s.startsWith("<html") || s.includes("<head") || s.includes("<body");
}
