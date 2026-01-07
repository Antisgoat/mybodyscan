import { reportError } from "@/lib/telemetry";
import { isNative } from "@/lib/platform";

type AuthPersistenceMode =
  | "indexeddb"
  | "local"
  | "session"
  | "memory"
  | "unknown";

type InitAuthState = {
  started: boolean;
  completed: boolean;
  persistence: AuthPersistenceMode;
  redirectError: string | null;
};

let initPromise: Promise<void> | null = null;
const state: InitAuthState = {
  started: false,
  completed: false,
  persistence: "unknown",
  redirectError: null,
};

export function getInitAuthState(): InitAuthState {
  return { ...state };
}

/**
 * Boot-critical auth initialization:
 * a) Explicitly set persistence (prefer IndexedDB; fallback to local/session)
 * b) Finalize any pending redirect result (must happen before routing decisions)
 * c) Attach onAuthStateChanged and wait for the first event (authReady)
 */
export async function initAuth(): Promise<void> {
  if (initPromise) return initPromise;
  state.started = true;
  initPromise = (async () => {
    void reportError({
      kind: "auth.init",
      message: "auth.init",
      extra: { phase: "start" },
    });
    // Web-only: set Firebase JS SDK persistence early.
    if (!isNative()) {
      const { ensureWebAuthPersistence } = await import("@/auth/impl.web");
      state.persistence = await ensureWebAuthPersistence().catch(() => "unknown");
    } else {
      state.persistence = "memory";
    }

    if (!isNative()) {
      // Always attempt redirect finalization (safe if no redirect is pending).
      // This is critical for iOS Safari and also covers edge cases where a WebView
      // ends up using web-based redirects (or reauth redirects) instead of native auth.
      try {
        const { finalizeRedirectResult } = await import("@/auth/impl.web");
        await finalizeRedirectResult().catch(() => null);
        state.redirectError = null;
      } catch (err: any) {
        // Never crash boot on redirect errors; they are surfaced via UI/telemetry.
        state.redirectError =
          typeof err?.message === "string" ? err.message : String(err);
      }
    }

    // On native boot, auth is intentionally not initialized.
    if (!isNative()) {
      const { startAuthListener } = await import("@/lib/authFacade");
      await startAuthListener().catch(() => undefined);
    }
    state.completed = true;
    void reportError({
      kind: "auth.init",
      message: "auth.init",
      extra: {
        phase: "done",
        persistence: state.persistence,
        redirectError: state.redirectError ? true : false,
      },
    });
  })();

  return initPromise;
}
