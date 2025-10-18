import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import { initAppCheck } from "./appCheck";
import { killSW } from "./lib/killSW";
import { warnIfDomainUnauthorized } from "./lib/firebaseAuthConfig";
import { initSentry, addPerformanceMark, measurePerformance, setBuildTag } from "./lib/sentry";

// Initialize Sentry first
initSentry();

// Set build tag (commit SHA) for Sentry
setBuildTag(import.meta.env.VITE_GIT_SHA || import.meta.env.VITE_COMMIT_SHA);

// Add performance marks
addPerformanceMark('app-start');

killSW();
warnIfDomainUnauthorized();
void initAppCheck().catch((e) => console.warn("AppCheck init skipped:", e?.message || e));

// Mark Firebase init complete
addPerformanceMark('firebase-init-complete');

ReactDOM.createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>
);

// Mark first render complete
addPerformanceMark('first-render-complete');

// Measure total app startup time
measurePerformance('app-startup', 'app-start', 'first-render-complete');
