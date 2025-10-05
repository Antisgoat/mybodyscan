import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { AppErrorBoundary } from "./app/AppErrorBoundary";
import { initAppCheck } from "./appCheck";
import { killSW } from "./lib/killSW";

killSW();
const buildTag = import.meta.env.VITE_APP_VERSION || import.meta.env.VITE_BUILD_TAG;
if (typeof document !== "undefined" && buildTag) {
  const meta = document.querySelector<HTMLMetaElement>("meta[data-build-tag]");
  if (meta) {
    meta.content = String(buildTag);
  }
}
void initAppCheck().catch((e) => console.warn("AppCheck init skipped:", e));

ReactDOM.createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>
);
