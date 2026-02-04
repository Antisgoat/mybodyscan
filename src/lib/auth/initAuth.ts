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
  step: string | null;
  lastError: string | null;
  timedOut: boolean;
};

let initPromise: Promise<void> | null = null;
const state: InitAuthState = {
  started: false,
  completed: false,
  persistence: "unknown",
  redirectError: null,
  step: null,
  lastError: null,
  timedOut: false,
};

export function getInitAuthState(): InitAuthState {
  return { ...state };
}

const INIT_AUTH_TIMEOUT_MS = 5_000;
const STEP_TIMEOUT_MS = 2_000;
const NATIVE_BOOT_FAIL_KEY = "mybodyscan:auth:bootFailCount";
const NATIVE_BOOT_RECOVERY_KEY = "mybodyscan:auth:bootRecoveryAttempted";

function getStorageSafe() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function getBootFailCount(): number {
  const storage = getStorageSafe();
  if (!storage) return 0;
  const raw = storage.getItem(NATIVE_BOOT_FAIL_KEY);
  const count = Number.parseInt(raw || "0", 10);
  return Number.isFinite(count) && count > 0 ? count : 0;
}

function markBootFailure() {
  const storage = getStorageSafe();
  if (!storage) return;
  const next = getBootFailCount() + 1;
  storage.setItem(NATIVE_BOOT_FAIL_KEY, String(next));
}

function clearBootFailureFlags() {
  const storage = getStorageSafe();
  if (!storage) return;
  storage.removeItem(NATIVE_BOOT_FAIL_KEY);
  storage.removeItem(NATIVE_BOOT_RECOVERY_KEY);
}

function markRecoveryAttempted() {
  const storage = getStorageSafe();
  if (!storage) return;
  storage.setItem(NATIVE_BOOT_RECOVERY_KEY, String(Date.now()));
}

function hasRecoveryAttempted(): boolean {
  const storage = getStorageSafe();
  if (!storage) return false;
  return Boolean(storage.getItem(NATIVE_BOOT_RECOVERY_KEY));
}

function clearAuthStorageKeyed(storage: Storage | undefined | null) {
  if (!storage) return;
  const prefixes = ["firebase:", "firebaseLocalStorage", "mybodyscan:auth:"];
  for (let i = storage.length - 1; i >= 0; i -= 1) {
    const key = storage.key(i);
    if (!key) continue;
    if (prefixes.some((prefix) => key.startsWith(prefix))) {
      storage.removeItem(key);
    }
  }
}

async function clearIndexedDbAuthStorage(): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase("firebaseLocalStorageDb");
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string
): Promise<{ value?: T; timedOut: boolean }> {
  let timeoutId: number | null = null;
  const schedule =
    typeof window === "undefined" ? globalThis.setTimeout : window.setTimeout;
  const timeoutPromise = new Promise<{ timedOut: boolean }>((resolve) => {
    timeoutId = schedule(() => resolve({ timedOut: true }), timeoutMs) as unknown as number;
  });
  const guardedPromise = promise
    .then((value) => ({ value, timedOut: false as const }))
    .catch((error) => ({ error, timedOut: false as const }));
  const result = await Promise.race([guardedPromise, timeoutPromise]);
  if (timeoutId !== null) {
    const clear =
      typeof window === "undefined"
        ? globalThis.clearTimeout
        : window.clearTimeout;
    clear(timeoutId);
  }
  if (result.timedOut) {
    if (typeof console !== "undefined") {
      console.warn("[auth] step timeout", { step: label });
    }
  }
  if ("error" in result && result.error) {
    throw result.error;
  }
  return result;
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
  state.step = "start";
  state.lastError = null;
  state.timedOut = false;
  initPromise = (async () => {
    const native = isNative();
    let timedOut = false;
    let hadFailure = false;
    const start = Date.now();
    const log = (phase: string, extra?: Record<string, unknown>) => {
      if (typeof console !== "undefined") {
        console.info(phase, extra);
      }
    };
    const logFail = (phase: string, error: unknown) => {
      state.lastError =
        error instanceof Error ? error.message : String(error ?? "unknown");
      if (typeof console !== "undefined") {
        console.warn(phase, { error: state.lastError });
      }
    };

    log("auth:init:start");
    void reportError({
      kind: "auth.init",
      message: "auth.init",
      extra: { phase: "start" },
    });

    const initSequence = async () => {
      if (native && getBootFailCount() > 0 && !hasRecoveryAttempted()) {
        state.step = "recovery";
        log("auth:init:recovery");
        try {
          clearAuthStorageKeyed(
            typeof window === "undefined" ? null : window.localStorage
          );
          clearAuthStorageKeyed(
            typeof window === "undefined" ? null : window.sessionStorage
          );
          const clearResult = await withTimeout(
            clearIndexedDbAuthStorage(),
            STEP_TIMEOUT_MS,
            "clear_indexeddb"
          );
          if (clearResult.timedOut) {
            log("auth:init:recovery:timeout");
          }
          markRecoveryAttempted();
        } catch (err) {
          logFail("auth:init:recovery:fail", err);
        }
      }

      // Set Firebase JS SDK persistence early.
      state.step = "persistence";
      const { ensureWebAuthPersistence } = await import("@/auth/webAuth");
      log("auth:persistence:set");
      try {
        const result = await withTimeout(
          ensureWebAuthPersistence(),
          STEP_TIMEOUT_MS,
          "persistence"
        );
        state.persistence = result.value ?? "unknown";
        if (result.timedOut) {
          state.persistence = "unknown";
        }
      } catch (err) {
        state.persistence = "unknown";
        logFail("auth:persistence:fail", err);
      }

      // Always attempt redirect finalization (safe if no redirect is pending).
      // This is critical for iOS Safari and also covers edge cases where a WebView
      // ends up using web-based redirects (or reauth redirects) instead of native auth.
      state.step = "redirect";
      try {
        const { finalizeRedirectResult } = await import("@/auth/webAuth");
        const result = await withTimeout(
          finalizeRedirectResult(),
          STEP_TIMEOUT_MS,
          "redirect"
        );
        if (result.timedOut) {
          state.redirectError = "redirect_timeout";
        } else {
          state.redirectError = null;
        }
      } catch (err: any) {
        // Never crash boot on redirect errors; they are surfaced via UI/telemetry.
        state.redirectError =
          typeof err?.message === "string" ? err.message : String(err);
        logFail("auth:redirect:fail", err);
      }

      state.step = "listener";
      log("auth:state:listener");
      const { startAuthListener } = await import("@/auth/mbs-auth");
      try {
        const result = await withTimeout(
          startAuthListener(),
          STEP_TIMEOUT_MS,
          "listener"
        );
        if (result.timedOut) {
          log("auth:state:listener:timeout");
        }
      } catch (err) {
        logFail("auth:state:listener:fail", err);
      }
    };

    try {
      const overall = await withTimeout(
        initSequence(),
        INIT_AUTH_TIMEOUT_MS,
        "init"
      );
      if (overall.timedOut) {
        timedOut = true;
        hadFailure = true;
        state.timedOut = true;
        log("auth:init:timeout");
        if (native) {
          markBootFailure();
        }
      }
    } catch (err) {
      hadFailure = true;
      logFail("auth:init:fail", err);
      if (native) {
        markBootFailure();
      }
    } finally {
      state.completed = true;
      state.step = "done";
      if (!hadFailure && native) {
        clearBootFailureFlags();
      }
      log("auth:init:done", {
        persistence: state.persistence,
        redirectError: Boolean(state.redirectError),
        timedOut,
        durationMs: Date.now() - start,
      });
      void reportError({
        kind: "auth.init",
        message: "auth.init",
        extra: {
          phase: timedOut ? "timeout" : "done",
          persistence: state.persistence,
          redirectError: state.redirectError ? true : false,
        },
      });
    }
  })();

  return initPromise;
}
