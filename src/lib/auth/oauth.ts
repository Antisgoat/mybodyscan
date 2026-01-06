import type {
  AuthProvider,
  UserCredential,
  User,
} from "firebase/auth";
import { getRedirectResult, signInWithRedirect } from "firebase/auth";
import { reportError } from "@/lib/telemetry";
import { getFirebaseAuth, getFirebaseConfig } from "@/lib/firebase";
import { popupThenRedirect as popupThenRedirectImported } from "@/lib/popupThenRedirect";
import { rememberAuthRedirect } from "@/lib/auth/redirectState";
import { isNative } from "@/lib/platform";

export type OAuthProviderId = "google.com" | "apple.com";

const PENDING_KEY = "mybodyscan:auth:oauth:pending";
const MAX_AUTH_WAIT_MS = 15_000;

let signInGuard: { providerId: OAuthProviderId; startedAt: number } | null =
  null;
let finalizePromise: Promise<UserCredential | null> | null = null;
let popupThenRedirectFn = popupThenRedirectImported;

function authEvent(kind: string, extra?: Record<string, unknown>) {
  const stamp = Date.now();
  void reportError({
    kind,
    message: kind,
    extra: { at: stamp, ...(extra ?? {}) },
  });
}

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
    if ((window as any).Capacitor?.isNativePlatform?.()) return true;
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

export type OAuthStartOptions = {
  providerId: OAuthProviderId;
  provider: AuthProvider;
  next?: string | null;
};

/**
 * Provider-agnostic OAuth sign-in entrypoint:
 * - Redirect on mobile/iOS Safari/WebViews
 * - Popup on desktop, with safe redirect fallback
 * - Prevents multiple simultaneous sign-ins
 * - Enforces a 15s max wait for popup flows (no silent hangs)
 */
export async function signInWithOAuthProvider(
  options: OAuthStartOptions
): Promise<{ user: User | null; credential: UserCredential | null }> {
  const startedAt = Date.now();
  authEvent("auth_start", {
    provider: options.providerId,
    next: options.next ?? null,
    startedAt,
    preferRedirect: shouldPreferRedirect(),
  });
  if (isNative()) {
    authEvent("auth_skip_native", { provider: options.providerId });
    clearPending();
    signInGuard = null;
    const err = new Error(
      "Web-based OAuth popups/redirects are disabled on native builds. Use native auth plugins instead."
    );
    (err as any).code = "auth/native-web-oauth-blocked";
    throw err;
  }
  if (signInGuard && startedAt - signInGuard.startedAt < MAX_AUTH_WAIT_MS) {
    const err = new Error("Sign-in already in progress.");
    (err as any).code = "auth/signin-already-in-progress";
    throw err;
  }
  signInGuard = { providerId: options.providerId, startedAt };

  const auth = getFirebaseAuth();
  const cfg = getFirebaseConfig();
  const origin = typeof window !== "undefined" ? window.location.origin : "(unknown)";
  void reportError({
    kind: "auth_origin_check",
    message: "auth_origin_check",
    extra: {
      origin,
      authDomain: cfg?.authDomain ?? null,
      projectId: cfg?.projectId ?? null,
      provider: options.providerId,
    },
  });

  if (options.next) {
    rememberAuthRedirect(options.next);
  }

  storePending({ providerId: options.providerId, startedAt });

  try {
    if (shouldPreferRedirect()) {
      authEvent("auth_redirect_start", { provider: options.providerId });
      // Redirect returns immediately; completion happens after reload.
      await withTimeout(
        // `popupThenRedirect` always redirects on iOS WebKit; on desktop it tries popup first.
        // Force redirect behavior by calling signInWithRedirect directly via getRedirectResult? No: simplest is popupThenRedirect + iOS/mobile guard.
        // Here, we explicitly trigger redirect to avoid any popup hangs.
        (async () => {
          // Avoid duplicate redirect attempts: clear any stale redirect result first.
          // (Firebase SDK is safe if none is pending.)
          await getRedirectResult(auth).catch(() => undefined);
          await signInWithRedirect(auth, options.provider);
        })(),
        MAX_AUTH_WAIT_MS,
        "auth/timeout"
      );
      return { user: null, credential: null };
    }

    authEvent("auth_popup_start", { provider: options.providerId });
    const cred = await withTimeout(
      popupThenRedirectFn(auth, options.provider),
      MAX_AUTH_WAIT_MS,
      "auth/timeout"
    );
    // popupThenRedirect returns undefined if redirect was initiated.
    if (!cred) {
      return { user: null, credential: null };
    }
    authEvent("auth_success", { provider: options.providerId, method: "popup" });
    clearPending();
    return { user: cred.user ?? null, credential: cred };
  } catch (error) {
    authEvent("auth_error", {
      provider: options.providerId,
      code: typeof (error as any)?.code === "string" ? (error as any).code : null,
      message:
        typeof (error as any)?.message === "string" ? (error as any).message : null,
    });
    clearPending();
    throw error;
  } finally {
    signInGuard = null;
  }
}

/**
 * Finalize a pending redirect result at boot.
 * This must be called exactly once on app startup.
 */
export async function finalizeRedirectResult(): Promise<{
  user: User | null;
  credential: UserCredential | null;
} | null> {
  if (isNative()) {
    return null;
  }
  if (finalizePromise) {
    const cred = await finalizePromise;
    return cred ? { user: cred.user ?? null, credential: cred } : null;
  }
  const { handleAuthRedirectOnce } = await import("@/lib/authRedirect");
  finalizePromise = withTimeout(
    handleAuthRedirectOnce().then((outcome) => outcome.result),
    MAX_AUTH_WAIT_MS,
    "auth/timeout"
  )
    .then((cred) => {
      clearPending();
      if (cred) {
        authEvent("auth_success", { provider: "redirect", method: "redirect" });
      }
      return cred ?? null;
    })
    .catch(async (err) => {
      clearPending();
      const code =
        typeof (err as any)?.code === "string" ? (err as any).code : undefined;
      const message =
        typeof (err as any)?.message === "string"
          ? (err as any).message
          : "Redirect sign-in failed.";
      void reportError({
        kind: "auth_redirect_finalize_failed",
        message,
        code,
      });
      authEvent("auth_error", { provider: "redirect", code, message });
      // Preserve existing authRedirect.ts error consumption pipeline.
      throw err;
    });

  const cred = await finalizePromise.catch(() => null);
  return cred ? { user: cred.user ?? null, credential: cred } : null;
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
  setPopupThenRedirectForTest(fn: typeof popupThenRedirectImported) {
    popupThenRedirectFn = fn;
  },
  reset() {
    signInGuard = null;
    finalizePromise = null;
    popupThenRedirectFn = popupThenRedirectImported;
    clearPending();
  },
};
