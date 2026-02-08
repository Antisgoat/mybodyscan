import { reportError } from "@/lib/telemetry";
import { isCapacitorNative } from "@/lib/platform/isNative";

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
const NATIVE_INIT_TIMEOUT_MS = 1_000;
const NATIVE_STEP_TIMEOUT_MS = 800;
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

class AuthTimeoutError extends Error {
  code = "auth/timeout";
  label: string;
  timeoutMs: number;

  constructor(label: string, timeoutMs: number) {
    super(`Auth step "${label}" timed out after ${timeoutMs}ms`);
    this.name = "AuthTimeoutError";
    this.label = label;
    this.timeoutMs = timeoutMs;
  }
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string
): Promise<T> {
  if (timeoutMs <= 0) return promise;
  let timeoutId: number | null = null;
  const schedule =
    typeof window === "undefined" ? globalThis.setTimeout : window.setTimeout;
  const clear =
    typeof window === "undefined" ? globalThis.clearTimeout : window.clearTimeout;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = schedule(
      () => reject(new AuthTimeoutError(label, timeoutMs)),
      timeoutMs
    ) as unknown as number;
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId !== null) {
      clear(timeoutId);
    }
  });
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
    const native = isCapacitorNative();
    const stepTimeoutMs = native ? NATIVE_STEP_TIMEOUT_MS : STEP_TIMEOUT_MS;
    const initTimeoutMs = native ? NATIVE_INIT_TIMEOUT_MS : INIT_AUTH_TIMEOUT_MS;
    const diagnosticsEnabled =
      import.meta.env.DEV &&
      (import.meta.env.VITE_AUTH_DIAGNOSTICS === "1" ||
        import.meta.env.VITE_NATIVE_AUTH_DIAGNOSTICS === "1");
    let timedOut = false;
    let hadFailure = false;
    const start = Date.now();
    const log = (phase: string, extra?: Record<string, unknown>) => {
      if (typeof console !== "undefined") {
        console.info(phase, extra);
      }
    };
    const debugLog = (phase: string, extra?: Record<string, unknown>) => {
      if (!diagnosticsEnabled || typeof console === "undefined") return;
      console.info(`[auth:debug] ${phase}`, extra);
    };
    const logFail = (phase: string, error: unknown) => {
      state.lastError =
        error instanceof Error ? error.message : String(error ?? "unknown");
      if (typeof console !== "undefined") {
        console.warn(phase, { error: state.lastError });
      }
    };
    const logTimeout = (label: string) => {
      if (typeof console !== "undefined") {
        console.warn("[auth] step timeout", { step: label });
      }
    };

    log("auth:init:start");
    void reportError({
      kind: "auth.init",
      message: "auth.init",
      extra: { phase: "start" },
    });

    const runStep = async <T,>(
      label: string,
      promise: Promise<T>,
      options?: { swallowTimeout?: boolean; timeoutMs?: number }
    ): Promise<T | null> => {
      try {
        return await withTimeout(
          promise,
          options?.timeoutMs ?? stepTimeoutMs,
          label
        );
      } catch (err) {
        if (err instanceof AuthTimeoutError) {
          logTimeout(label);
          if (options?.swallowTimeout) {
            return null;
          }
        }
        throw err;
      }
    };

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
          await runStep("clear_indexeddb", clearIndexedDbAuthStorage(), {
            swallowTimeout: true,
          });
          markRecoveryAttempted();
        } catch (err) {
          logFail("auth:init:recovery:fail", err);
        }
      }

      // Set Firebase JS SDK persistence early.
      state.step = "persistence";
      const { ensureWebAuthPersistence } = await import("@/auth/webAuth");
      log("auth:persistence:set");
      debugLog("persistence:begin", { native });
      try {
        const result = await runStep("persistence", ensureWebAuthPersistence(), {
          swallowTimeout: native,
        });
        state.persistence = result ?? "unknown";
        debugLog("persistence:done", { mode: state.persistence });
      } catch (err) {
        state.persistence = "unknown";
        logFail("auth:persistence:fail", err);
      }

      if (!native) {
        // Web-only: finalize any pending OAuth redirects.
        state.step = "redirect";
        try {
          const { finalizeRedirectResult } = await import("@/auth/webAuth");
          await runStep("redirect", finalizeRedirectResult(), {
            swallowTimeout: false,
          });
          state.redirectError = null;
        } catch (err: any) {
          if (err instanceof AuthTimeoutError) {
            state.redirectError = "redirect_timeout";
          } else {
            // Never crash boot on redirect errors; they are surfaced via UI/telemetry.
            state.redirectError =
              typeof err?.message === "string" ? err.message : String(err);
            logFail("auth:redirect:fail", err);
          }
        }
      } else {
        state.redirectError = null;
      }

      state.step = "listener";
      log("auth:state:listener");
      const { startAuthListener } = await import("@/auth/mbs-auth");
      try {
        await runStep("listener", startAuthListener(), {
          swallowTimeout: native,
        });
      } catch (err) {
        logFail("auth:state:listener:fail", err);
      }
    };

    try {
      await withTimeout(initSequence(), initTimeoutMs, "init");
    } catch (err) {
      if (err instanceof AuthTimeoutError) {
        timedOut = true;
        state.timedOut = true;
        if (native) {
          log("auth:init:timeout (native non-fatal)");
        } else {
          hadFailure = true;
          log("auth:init:timeout");
        }
      } else {
        hadFailure = true;
        logFail("auth:init:fail", err);
        if (native) {
          markBootFailure();
        }
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
