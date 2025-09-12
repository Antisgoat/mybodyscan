import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";
import "./styles/mbs.theme.css";
import GlobalErrorBoundary from "./components/GlobalErrorBoundary";
import EnvBanner from "./components/EnvBanner";
import { runPreviewChecks } from "./components/PreviewHealthCheck";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <GlobalErrorBoundary>
        <EnvBanner />
        <App />
        {import.meta.env.DEV && runPreviewChecks()}
      </GlobalErrorBoundary>
    </BrowserRouter>
  </React.StrictMode>
);
