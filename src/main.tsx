import "./lib/bootProbe";
import { StrictMode, Suspense } from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import { FirebaseInitError } from "./components/FirebaseInitError";
import { probeFirebaseRuntime } from "@/lib/firebase/runtimeConfig";
import { auth, firebaseReady, getFirebaseInitError, logFirebaseRuntimeInfo } from "./lib/firebase";
import { handleAuthRedirectOnce } from "./lib/authRedirect";
import { initTelemetry } from "./lib/telemetry";
import { sanitizeFoodItem } from "@/lib/nutrition/sanitize";
import { assertEnv } from "@/lib/env";

// Legacy shim: some older code may still reference global sanitizeFoodItem.
// This avoids runtime errors like "Can't find variable: sanitizeFoodItem".
(globalThis as any).sanitizeFoodItem = (globalThis as any).sanitizeFoodItem || sanitizeFoodItem;

assertEnv();

handleAuthRedirectOnce();

// Boot error trap to capture first thrown error before any UI swallows it
if (typeof window !== "undefined") {
  window.addEventListener("error", (e) => {
    if (!(window as any).__firstBootError) {
      (window as any).__firstBootError = true;
      console.error("[boot] first error:", e?.error || e?.message, e?.filename, e?.lineno, e?.colno, e?.error?.stack);
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
  await firebaseReady().catch(() => undefined);
  logFirebaseRuntimeInfo();

  void probeFirebaseRuntime();

  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  const host = document.getElementById("root");
  if (!host) {
    throw new Error("Root container #root not found");
  }

  const root = ReactDOM.createRoot(host);
  const initError = getFirebaseInitError();
  const hasAuthInstance = Boolean(auth);

  if (initError || !hasAuthInstance) {
    root.render(
      <StrictMode>
        <AppErrorBoundary>
          <FirebaseInitError
            message={initError ?? "Firebase Auth is not available for this origin. Add this domain in Firebase Auth settings."}
          />
        </AppErrorBoundary>
      </StrictMode>
    );
    return;
  }

  root.render(
    <StrictMode>
      <AppErrorBoundary>
        <Suspense fallback={null}>
          <App />
        </Suspense>
      </AppErrorBoundary>
    </StrictMode>
  );
})();
