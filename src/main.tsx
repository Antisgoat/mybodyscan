import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import { killSW } from "./lib/killSW";
import { warnIfDomainUnauthorized } from "./lib/firebaseAuthConfig";
import { initSentry, addPerformanceMark, measurePerformance } from "./lib/sentry";
import { initApp } from "./lib/firebase";
import { ALLOWED_HOSTS } from "./lib/env";

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

async function bootstrap() {
  initSentry();
  addPerformanceMark("app-start");

  killSW();
  warnIfDomainUnauthorized();
  warnIfHostNotAllowListed();

  try {
    await initApp();
  } catch (error) {
    console.error("[firebase] initialization failed", error);
  }

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
