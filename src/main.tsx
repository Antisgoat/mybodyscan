import "./lib/bootProbe";
import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import { initAppCheck } from "./appCheck";
import { killSW } from "./lib/killSW";
import { warnIfDomainUnauthorized } from "./lib/firebaseAuthConfig";
import { probeFirebaseRuntime } from "@/lib/firebase/runtimeConfig";
import { auth as firebaseAuth } from "@/lib/firebase";
import { getRedirectResult } from "firebase/auth";

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

// Initialize auth and handle redirect results
async function initAuthAndRedirects() {
  try {
    const result = await getRedirectResult(firebaseAuth);
    if (result) {
      console.log("[init] Redirect result processed:", result.user?.uid);
    }
  } catch (error) {
    console.warn("[init] Auth/redirect init failed:", error);
  }
}

killSW();
warnIfDomainUnauthorized();
void initAppCheck().catch((e) => console.warn("AppCheck init skipped:", e?.message || e));
void probeFirebaseRuntime();
void initAuthAndRedirects();

if (typeof window !== "undefined" && typeof document !== "undefined") {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <AppErrorBoundary>
        <App />
      </AppErrorBoundary>
    </StrictMode>
  );
}
