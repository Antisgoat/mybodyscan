import type { FirebaseError } from "firebase/app";
import { describeAuthErrorAsync, type NormalizedAuthError } from "./login";
import { reportError } from "./telemetry";
import { isNative } from "@/lib/platform";

const BENIGN_ERRORS = new Set([
  "auth/no-auth-event",
  "auth/popup-blocked",
  "auth/popup-closed-by-user",
]);

type AuthRedirectOutcome = {
  result: any | null;
  error: FirebaseError | null;
  normalizedError: NormalizedAuthError | null;
};

export type FriendlyFirebaseError = FirebaseError & {
  friendlyMessage?: string | null;
  friendlyCode?: string | null;
};

let handled = false;
let outcomePromise: Promise<AuthRedirectOutcome> | null = null;
let cachedOutcome: AuthRedirectOutcome | null = null;
let resultConsumed = false;
let errorConsumed = false;

function authEvent(kind: string, extra?: Record<string, unknown>) {
  const stamp = Date.now();
  void reportError({
    kind,
    message: kind,
    extra: { at: stamp, ...(extra ?? {}) },
  });
  // Compatibility with release logging names:
  if (kind === "auth_redirect_result") {
    void reportError({
      kind: "auth.redirect_result",
      message: "auth.redirect_result",
      extra: { at: stamp, ...(extra ?? {}) },
    });
  }
}

async function resolveRedirect(): Promise<AuthRedirectOutcome> {
  // Compile-time guard: in `--mode native` we must not even bundle the web impl.
  const isNativeBuild = __NATIVE__;
  if (isNativeBuild || isNative()) {
    const outcome: AuthRedirectOutcome = {
      result: null,
      error: null,
      normalizedError: null,
    };
    cachedOutcome = outcome;
    return outcome;
  }
  let auth: any | null = null;
  try {
    const { finalizeRedirectResult, webRequireAuth } = await import("@/auth/webAuth");
    auth = await webRequireAuth();
    const result = await finalizeRedirectResult().catch(() => null);
    const outcome: AuthRedirectOutcome = {
      result: result ?? null,
      error: null,
      normalizedError: null,
    };
    cachedOutcome = outcome;
    return outcome;
  } catch (error) {
    const fbError = (error as FirebaseError) ?? null;
    if (fbError?.code && BENIGN_ERRORS.has(fbError.code)) {
      authEvent("auth_redirect_result", {
        phase: "benign",
        code: fbError.code,
      });
      const outcome: AuthRedirectOutcome = {
        result: null,
        error: null,
        normalizedError: null,
      };
      cachedOutcome = outcome;
      return outcome;
    }
    authEvent("auth_error", {
      phase: "redirect_result",
      code: fbError?.code ?? null,
      message:
        typeof (fbError as any)?.message === "string" ? (fbError as any).message : null,
    });
    if (import.meta.env.DEV) {
      console.warn("[auth] Redirect result failed", fbError?.code || error);
    }

    let normalized: NormalizedAuthError | null = null;
    if (fbError) {
      try {
        const { webRequireAuth } = await import("@/auth/webAuth");
        auth ??= await webRequireAuth();
        normalized = await describeAuthErrorAsync(auth, fbError);
      } catch (normalizeError) {
        if (import.meta.env.DEV) {
          console.warn(
            "[auth] Redirect error normalization failed",
            normalizeError
          );
        }
      }
    }

    const outcome: AuthRedirectOutcome = {
      result: null,
      error: fbError,
      normalizedError: normalized,
    };
    cachedOutcome = outcome;
    return outcome;
  }
}

export function handleAuthRedirectOnce(): Promise<AuthRedirectOutcome> {
  if (handled && outcomePromise) {
    return outcomePromise;
  }
  if (!outcomePromise) {
    outcomePromise = resolveRedirect().finally(() => {
      handled = true;
    });
  }
  return outcomePromise;
}

export async function consumeAuthRedirectResult(): Promise<any | null> {
  const outcome = await handleAuthRedirectOnce();
  if (resultConsumed) {
    return null;
  }
  resultConsumed = true;
  return outcome.result;
}

export async function consumeAuthRedirectError(): Promise<FriendlyFirebaseError | null> {
  const outcome = await handleAuthRedirectOnce();
  if (errorConsumed) {
    return null;
  }
  errorConsumed = true;
  if (!outcome.error) {
    return null;
  }
  const enriched = outcome.error as FriendlyFirebaseError;
  if (outcome.normalizedError) {
    enriched.friendlyMessage = outcome.normalizedError.message ?? null;
    enriched.friendlyCode =
      outcome.normalizedError.code ?? outcome.error.code ?? null;
  } else {
    enriched.friendlyMessage ??= null;
    enriched.friendlyCode ??= outcome.error.code ?? null;
  }
  return enriched;
}

export function peekAuthRedirectOutcome(): AuthRedirectOutcome | null {
  return cachedOutcome;
}
// Apple display name population lives in the web auth facade so
// Firebase Auth is only imported in a single web-only module.
