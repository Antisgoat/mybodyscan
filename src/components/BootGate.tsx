import { ReactNode, Suspense, useEffect, useMemo, useState } from "react";
import { initAuth } from "@/lib/auth/initAuth";
import { probeFirebaseRuntime } from "@/lib/firebase/runtimeConfig";
import { logFirebaseConfigSummary, logFirebaseRuntimeInfo } from "@/lib/firebase";

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
    void (async () => {
      await initAuth();
      logFirebaseConfigSummary();
      logFirebaseRuntimeInfo();
      void probeFirebaseRuntime();
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) {
    return <div style={BOOT_STYLE}>{fallback ?? label}</div>;
  }

  return (
    <Suspense fallback={<div style={BOOT_STYLE}>Loading…</div>}>
      {children}
    </Suspense>
  );
}

