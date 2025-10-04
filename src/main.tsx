import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { AppErrorBoundary } from "./app/AppErrorBoundary";
import { ensureAppCheck } from "./appCheck";
import { killSW } from "./lib/killSW";

killSW();
void ensureAppCheck().catch((e) => console.warn("AppCheck init skipped:", e));

ReactDOM.createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>
);
