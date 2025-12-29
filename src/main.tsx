import "./lib/bootProbe";
import { StrictMode, Suspense } from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import { probeFirebaseRuntime } from "@/lib/firebase/runtimeConfig";
import {
  firebaseReady,
  logFirebaseConfigSummary,
  logFirebaseRuntimeInfo,
} from "./lib/firebase";
import { finalizeRedirectResult } from "@/lib/auth/oauth";
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

void (async () => {
  await firebaseReady();
  await finalizeRedirectResult().catch(() => undefined);
  logFirebaseConfigSummary();
  logFirebaseRuntimeInfo();

  void probeFirebaseRuntime();

  if (typeof window !== "undefined" && typeof document !== "undefined") {
    ReactDOM.createRoot(document.getElementById("root")!).render(
      <StrictMode>
        <AppErrorBoundary>
          <Suspense
            fallback={
              <div
                style={{
                  minHeight: "100vh",
                  display: "grid",
                  placeItems: "center",
                  padding: 24,
                  textAlign: "center",
                  color: "#6b7280",
                  fontFamily:
                    'system-ui, -apple-system, Segoe UI, Roboto, "Helvetica Neue", Arial, "Noto Sans", "Liberation Sans", sans-serif',
                }}
              >
                Loading…
              </div>
            }
          >
            <App />
          </Suspense>
        </AppErrorBoundary>
      </StrictMode>
    );
  }
})();
