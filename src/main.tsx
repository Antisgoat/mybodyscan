import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { AppErrorBoundary } from "./components/AppErrorBoundary.tsx";
import { initAppCheck } from "./appCheck.ts";
import { killSW } from "./lib/killSW.ts";
import { warnIfDomainUnauthorized } from "./lib/firebaseAuthConfig.ts";
import { initSentry, addPerformanceMark, measurePerformance } from "./lib/sentry.ts";

// Initialize Sentry first
initSentry();

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
