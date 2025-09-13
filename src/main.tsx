import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";
import GlobalErrorBoundary from "./components/GlobalErrorBoundary";
import Skeleton from "./components/Skeleton";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <GlobalErrorBoundary>
        <React.Suspense fallback={<Skeleton />}>
          <App />
        </React.Suspense>
      </GlobalErrorBoundary>
    </BrowserRouter>
  </React.StrictMode>
);
