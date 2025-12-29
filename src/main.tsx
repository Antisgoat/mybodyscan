import "./lib/bootProbe";
import { StrictMode, Suspense, useEffect, useMemo, useState } from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import { probeFirebaseRuntime } from "@/lib/firebase/runtimeConfig";
import {
  logFirebaseConfigSummary,
  logFirebaseRuntimeInfo,
} from "./lib/firebase";
import { initAuth } from "@/lib/auth/initAuth";
import { initTelemetry } from "./lib/telemetry";
import { sanitizeFoodItem } from "@/lib/nutrition/sanitize";
import { assertEnv } from "@/lib/env";

// Legacy shim: some older code may still reference global sanitizeFoodItem.
// This avoids runtime errors like "Can't find variable: sanitizeFoodItem".
(globalThis as any).sanitizeFoodItem =
  (globalThis as any).sanitizeFoodItem || sanitizeFoodItem;

assertEnv();

// Boot error trap to capture first thrown error before any UI swallows it
if (typeof window !== "undefined") {
  window.addEventListener("error", (e) => {
    if (!(window as any).__firstBootError) {
      (window as any).__firstBootError = true;
      console.error(
        "[boot] first error:",
        e?.error || e?.message,
        e?.filename,
        e?.lineno,
        e?.colno,
        e?.error?.stack
      );
    }
  });
  window.addEventListener("unhandledrejection", (e) => {
    if (!(window as any).__firstBootError) {
      (window as any).__firstBootError = true;
      console.error("[boot] first unhandledrejection:", e?.reason);
    }
  });
  console.log("[init] App mounted");
  initTelemetry();
}

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

function BootGate() {
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
    return <div style={BOOT_STYLE}>{label}</div>;
  }

  return (
    <Suspense fallback={<div style={BOOT_STYLE}>Loading…</div>}>
      <App />
    </Suspense>
  );
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <AppErrorBoundary>
        <BootGate />
      </AppErrorBoundary>
    </StrictMode>
  );
}
