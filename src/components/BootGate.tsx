import { ReactNode, Suspense, useEffect, useMemo, useState } from "react";
import {
  getBlockingFirebaseConfigError,
  logFirebaseConfigSummary,
  logFirebaseRuntimeInfo,
} from "@/lib/firebase";
import { getInitAuthState } from "@/lib/auth/initAuth";
import { isNative } from "@/lib/platform";

const BOOT_STYLE: Record<string, string | number> = {
  minHeight: "100vh",
  display: "grid",
  placeItems: "center",
  padding: 24,
  textAlign: "center",
  color: "#6b7280",
  fontFamily:
    'system-ui, -apple-system, Segoe UI, Roboto, "Helvetica Neue", Arial, "Noto Sans", "Liberation Sans", sans-serif',
};

const PENDING_OAUTH_KEY = "mybodyscan:auth:oauth:pending";
const AUTH_BOOT_TIMEOUT_MS = 10_000;

/**
 * Minimal boot gate to ensure auth + runtime probes happen
 * before route guards make decisions.
 */
export function BootGate({
  children,
  fallback,
}: {
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const [ready, setReady] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const blockingConfigError = getBlockingFirebaseConfigError();
  const label = useMemo(() => {
    if (typeof window === "undefined") return "Loading…";
    try {
      return window.sessionStorage.getItem(PENDING_OAUTH_KEY)
        ? "Completing sign-in…"
        : "Loading…";
    } catch {
      return "Loading…";
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const native = isNative();
    const pendingOauth =
      typeof window !== "undefined"
        ? window.sessionStorage?.getItem(PENDING_OAUTH_KEY)
        : null;
    const logBoot = (phase: string, extra?: Record<string, unknown>) => {
      console.info("[boot]", {
        phase,
        native,
        pendingOauth: Boolean(pendingOauth),
        ...extra,
      });
    };
    logBoot("start");
    const timeout = window.setTimeout(() => {
      if (!cancelled) {
        logBoot("timeout", { initAuth: getInitAuthState() });
        setTimedOut(true);
      }
    }, AUTH_BOOT_TIMEOUT_MS);
    void (async () => {
      // Always safe to log config summary on both web + native.
      logFirebaseConfigSummary();
      logFirebaseRuntimeInfo();

      const [{ initAuth }, { probeFirebaseRuntime }] = await Promise.all([
        import("@/lib/auth/initAuth"),
        import("@/lib/firebase/runtimeConfig"),
      ]);
      logBoot("auth:init:start");
      await initAuth();
      logBoot("auth:init:done", { initAuth: getInitAuthState() });
      if (!native) {
        logBoot("firebase:probe:start");
        void probeFirebaseRuntime();
      }
      if (!cancelled) {
        setReady(true);
        setTimedOut(false);
        logBoot("ready");
      }
    })();
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, []);

  if (blockingConfigError) {
    return (
      <div style={BOOT_STYLE}>
        <div style={{ maxWidth: 520 }}>
          <div style={{ fontWeight: 700, color: "#111827" }}>
            Configuration error
          </div>
          <div style={{ marginTop: 8 }}>{blockingConfigError}</div>
        </div>
      </div>
    );
  }

  if (!ready) {
    if (timedOut) {
      return (
        <div style={BOOT_STYLE}>
          <div style={{ maxWidth: 520 }}>
            <div style={{ fontWeight: 700, color: "#111827" }}>
              Still loading…
            </div>
            <div style={{ marginTop: 8 }}>
              If this doesn’t resolve, try reloading. If you’re signing in,
              complete the login popup/redirect and then come back here.
            </div>
            <button
              type="button"
              style={{
                marginTop: 12,
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #d1d5db",
                background: "#111827",
                color: "#ffffff",
                fontWeight: 600,
                cursor: "pointer",
              }}
              onClick={() => {
                try {
                  window.location.reload();
                } catch {
                  // ignore
                }
              }}
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return <div style={BOOT_STYLE}>{fallback ?? label}</div>;
  }

  return (
    <Suspense fallback={<div style={BOOT_STYLE}>Loading…</div>}>
      {children}
    </Suspense>
  );
}
