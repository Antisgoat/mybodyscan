import { isCapacitorNative } from "@/lib/platform/isNative";

export type OAuthProviderId = "google.com" | "apple.com";

const PENDING_KEY = "mybodyscan:auth:oauth:pending";

export function isIosSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const isIOS = /iPad|iPhone|iPod/i.test(ua);
  if (!isIOS) return false;
  // iOS Chrome/Firefox/Edge embed their own tokens; treat them as non-Safari
  const isOtherBrowser = /CriOS|FxiOS|EdgiOS/i.test(ua);
  if (isOtherBrowser) return false;
  // Safari token is present in UA; "Mobile" is also typical, but iPadOS can be tricky.
  return /Safari/i.test(ua);
}

function isMobileLike(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  // Redirect is safest on mobile browsers (especially iOS WebKit variants).
  return /iPad|iPhone|iPod|Android|Mobile|IEMobile|Opera Mini/i.test(ua);
}

function shouldPreferRedirect(): boolean {
  if (typeof window === "undefined") return true;
  // iOS WebKit: popups are unreliable; redirect is safer.
  if (isMobileLike()) return true;
  // WebView-ish environments: also prefer redirect.
  try {
    if (isCapacitorNative()) return true;
  } catch {
    // ignore
  }
  try {
    if ((window as any).flutter_inappwebview != null) return true;
  } catch {
    // ignore
  }
  return false;
}

function withTimeout<T>(promise: Promise<T>, ms: number, code: string): Promise<T> {
  if (ms <= 0) return promise;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error("Sign-in timed out.");
      (err as any).code = code;
      reject(err);
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function storePending(next: { providerId: OAuthProviderId; startedAt: number }) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

function clearPending() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(PENDING_KEY);
  } catch {
    // ignore
  }
}

export function peekPendingOAuth():
  | { providerId: OAuthProviderId; startedAt: number }
  | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      providerId?: unknown;
      startedAt?: unknown;
    };
    const providerId =
      parsed.providerId === "google.com" || parsed.providerId === "apple.com"
        ? parsed.providerId
        : null;
    const startedAt =
      typeof parsed.startedAt === "number" && Number.isFinite(parsed.startedAt)
        ? parsed.startedAt
        : null;
    if (!providerId || startedAt == null) return null;
    return { providerId, startedAt };
  } catch {
    return null;
  }
}

export function clearPendingOAuth(): void {
  clearPending();
}

export function describeOAuthError(err: unknown): {
  code?: string;
  message: string;
  userMessage: string;
} {
  const code =
    err && typeof err === "object" && "code" in (err as any)
      ? String((err as any).code)
      : undefined;
  const rawMessage =
    err && typeof err === "object" && "message" in (err as any)
      ? String((err as any).message)
      : "";

  if (code === "auth/unauthorized-domain") {
    return {
      code,
      message: rawMessage,
      userMessage:
        "This domain isn’t authorized for sign-in. Please use mybodyscanapp.com",
    };
  }
  if (code === "auth/timeout") {
    return {
      code,
      message: rawMessage,
      userMessage: "Sign-in timed out. Please try again.",
    };
  }
  return {
    code,
    message: rawMessage,
    userMessage: "Sign-in failed. Please try again.",
  };
}

export const __oauthTestInternals = {
  reset() {
    clearPending();
  },
};
