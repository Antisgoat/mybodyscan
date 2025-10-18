import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import { killSW } from "./lib/killSW";
import { warnIfDomainUnauthorized } from "./lib/firebaseAuthConfig";
import { initSentry, addPerformanceMark, measurePerformance } from "./lib/sentry";
import { initFirebaseApp, getAuthSafe } from "./lib/firebase";
import { ALLOWED_HOSTS } from "./lib/env";
import { loadFirebaseAuthClientConfig, isProviderEnabled } from "./lib/firebaseAuthConfig";

function warnIfHostNotAllowListed() {
  if (typeof window === "undefined") return;
  const host = window.location.host.toLowerCase();
  const hostWithoutPort = host.split(":")[0];
  const allowed = ALLOWED_HOSTS.some((candidate) => {
    const trimmed = candidate.trim().toLowerCase();
    if (!trimmed) return false;
    const candidateHost = trimmed.split(":")[0];
    if (hostWithoutPort === candidateHost) return true;
    return hostWithoutPort.endsWith(`.${candidateHost}`);
  });
  if (!allowed) {
    console.warn(
      `[auth] ${host} is not listed in VITE_AUTH_ALLOWED_HOSTS. Google sign-in may be blocked until it is added.`,
    );
  }
}

async function logGoogleDebugInfo() {
  if (!import.meta.env.DEV) return;
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  if (params.get("debug") !== "1") return;

  try {
    const [config, authInstance] = await Promise.all([
      loadFirebaseAuthClientConfig(),
      getAuthSafe().catch(() => null),
    ]);

    const googleEnabled = isProviderEnabled("google.com", config);
    const host = window.location.host;
    const allowed = ALLOWED_HOSTS.some((candidate) => {
      const trimmed = candidate.trim().toLowerCase();
      if (!trimmed) return false;
      const hostLower = host.toLowerCase();
      if (hostLower === trimmed) return true;
      return hostLower.endsWith(`.${trimmed}`);
    });

    console.info("[debug] google_provider", {
      enabled: googleEnabled,
      host,
      hostAllowListed: allowed,
      authInitialized: Boolean(authInstance),
    });
  } catch (error) {
    console.warn("[debug] Unable to load Google provider diagnostics", error);
  }
}

async function bootstrap() {
  initSentry();
  addPerformanceMark("app-start");

  killSW();
  warnIfDomainUnauthorized();
  warnIfHostNotAllowListed();

  try {
    await initFirebaseApp();
  } catch (error) {
    console.error("[firebase] initialization failed", error);
  }

  void logGoogleDebugInfo();

  addPerformanceMark("firebase-init-complete");

  ReactDOM.createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <AppErrorBoundary>
        <App />
      </AppErrorBoundary>
    </StrictMode>,
  );

  addPerformanceMark("first-render-complete");
  measurePerformance("app-startup", "app-start", "first-render-complete");
}

void bootstrap();
