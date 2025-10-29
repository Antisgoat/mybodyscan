import "./lib/swKill";
import "./lib/bootProbe";
import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import { killSW } from "./lib/killSW";
import { warnIfDomainUnauthorized } from "./lib/firebaseAuthConfig";
import { probeFirebaseRuntime } from "@/lib/firebase/runtimeConfig";
import { firebaseReady } from "./lib/firebase";
import { handleAuthRedirectOnce } from "./lib/authRedirect";

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
}

void (async () => {
  await firebaseReady();

  killSW();
  warnIfDomainUnauthorized();
  void probeFirebaseRuntime();

  if (typeof window !== "undefined" && typeof document !== "undefined") {
    ReactDOM.createRoot(document.getElementById("root")!).render(
      <StrictMode>
        <AppErrorBoundary>
          <App />
        </AppErrorBoundary>
      </StrictMode>
    );
  }
})();
