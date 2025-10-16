import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import { initAppCheck } from "./appCheck";
import { killSW } from "./lib/killSW";
import { warnIfDomainUnauthorized } from "./lib/firebaseAuthConfig";

// Performance: measure firebase init to first render
const perfStart = (typeof performance !== "undefined") ? performance.now() : 0;

killSW();
warnIfDomainUnauthorized();
void initAppCheck().catch((e) => console.warn("AppCheck init skipped:", e?.message || e));

ReactDOM.createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>
);

try {
  if (typeof performance !== "undefined" && perfStart) {
    const elapsed = Math.round(performance.now() - perfStart);
    console.log(`[perf] app first render: ${elapsed}ms`);
  }
} catch {}
