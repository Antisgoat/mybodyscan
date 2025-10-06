import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { AppErrorBoundary } from "./app/AppErrorBoundary";
import { initAppCheck } from "./appCheck";
import { killSW } from "./lib/killSW";
import { warnIfDomainUnauthorized } from "./lib/firebaseAuthConfig";

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
