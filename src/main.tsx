import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";
import GlobalErrorBoundary from "./components/GlobalErrorBoundary";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <GlobalErrorBoundary>
        <App />
      </GlobalErrorBoundary>
    </BrowserRouter>
  </React.StrictMode>
);
