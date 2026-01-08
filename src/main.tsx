import "./lib/bootProbe";
import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import { initTelemetry } from "./lib/telemetry";
import { sanitizeFoodItem } from "@/lib/nutrition/sanitize";
import { assertEnv } from "@/lib/env";
import { BootGate } from "@/components/BootGate";
import { isNative } from "@/lib/platform";

// Legacy shim: some older code may still reference global sanitizeFoodItem.
// This avoids runtime errors like "Can't find variable: sanitizeFoodItem".
(globalThis as any).sanitizeFoodItem =
  (globalThis as any).sanitizeFoodItem || sanitizeFoodItem;

type BootFailure = {
  code: string;
  message: string;
  stack?: string;
};

function normalizeBootFailure(error: unknown, code = "boot_failed"): BootFailure {
  if (error instanceof Error) {
    return {
      code,
      message: error.message || "Unknown error",
      stack: error.stack || undefined,
    };
  }
  if (typeof error === "string") {
    return { code, message: error };
  }
  try {
    return { code, message: JSON.stringify(error) };
  } catch {
    return { code, message: String(error) };
  }
}

function ensureRootEl(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  const existing = document.getElementById("root");
  if (existing) return existing;
  try {
    const el = document.createElement("div");
    el.id = "root";
    document.body.appendChild(el);
    return el;
  } catch {
    return null;
  }
}

function BootFailureScreen({ failure }: { failure: BootFailure }) {
  const style: Record<string, string | number> = {
    minHeight: "100vh",
    padding: 24,
    display: "grid",
    placeItems: "center",
    fontFamily:
      'system-ui, -apple-system, Segoe UI, Roboto, "Helvetica Neue", Arial, "Noto Sans", "Liberation Sans", sans-serif',
    background: "#ffffff",
    color: "#111827",
  };
  const card: Record<string, string | number> = {
    width: "min(720px, 100%)",
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    padding: 16,
    boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
  };
  const muted: Record<string, string | number> = {
    color: "#6b7280",
    fontSize: 14,
    marginTop: 8,
  };
  const pre: Record<string, string | number> = {
    marginTop: 12,
    padding: 12,
    borderRadius: 8,
    background: "#f9fafb",
    border: "1px solid #e5e7eb",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    fontSize: 12,
    color: "#111827",
    maxHeight: "40vh",
    overflow: "auto",
  };
  const btn: Record<string, string | number> = {
    marginTop: 12,
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #d1d5db",
    background: "#111827",
    color: "#ffffff",
    fontWeight: 600,
    cursor: "pointer",
  };
  return (
    <div style={style}>
      <div style={card}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>
          App failed to start
        </div>
        <div style={muted}>
          Error code: <code>{failure.code}</code>
        </div>
        <div style={muted}>{failure.message}</div>
        {failure.stack ? <pre style={pre}>{failure.stack}</pre> : null}
        <button
          type="button"
          style={btn}
          onClick={() => {
            try {
              window.location.reload();
            } catch {
              // ignore
            }
          }}
        >
          Reload
        </button>
      </div>
    </div>
  );
}

function renderBootFailure(error: unknown, code?: string) {
  // Crash shield is native-only to prevent blank white screens in WKWebView.
  if (!isNative()) return;
  if (typeof window === "undefined") return;
  const anyWin = window as any;
  if (anyWin.__mbsBootFailureRendered) return;
  anyWin.__mbsBootFailureRendered = true;

  const failure = normalizeBootFailure(error, code);
  // eslint-disable-next-line no-console
  console.error("[boot] fatal:", failure.code, failure.message, failure.stack);

  const root = ensureRootEl();
  if (!root) return;
  try {
    ReactDOM.createRoot(root).render(
      <StrictMode>
        <BootFailureScreen failure={failure} />
      </StrictMode>
    );
  } catch (e) {
    // If React can't render for any reason, fall back to plain DOM.
    try {
      root.innerHTML = "";
      const pre = document.createElement("pre");
      pre.style.whiteSpace = "pre-wrap";
      pre.style.wordBreak = "break-word";
      pre.textContent = `App failed to start (${failure.code})\n\n${failure.message}\n\n${failure.stack || ""}`;
      root.appendChild(pre);
    } catch {
      // ignore
    }
  }
}

try {
  assertEnv();
} catch (e) {
  renderBootFailure(e, "env_assert_failed");
}

// Telemetry should initialize on both web and native.
if (typeof window !== "undefined") {
  try {
    initTelemetry();
  } catch (e) {
    renderBootFailure(e, "telemetry_init_failed");
  }
}

// Boot error trap to capture first thrown error before any UI swallows it.
// Native-only (per crash-shield spec) to prevent WKWebView blank screens.
if (typeof window !== "undefined" && isNative()) {
  window.addEventListener("error", (e) => {
    if (!(window as any).__firstBootError) {
      (window as any).__firstBootError = true;
      console.error(
        "[boot] first error:",
        e?.error || e?.message,
        e?.filename,
        e?.lineno,
        e?.colno,
        e?.error?.stack
      );
    }
    // Render a loud error screen if the app never mounted / crashed hard.
    renderBootFailure(e?.error || e?.message || e, "window_error");
  });
  window.addEventListener("unhandledrejection", (e) => {
    if (!(window as any).__firstBootError) {
      (window as any).__firstBootError = true;
      console.error("[boot] first unhandledrejection:", e?.reason);
    }
    renderBootFailure(e?.reason || e, "unhandled_rejection");
  });
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  try {
    const root = ensureRootEl();
    if (!root) {
      throw new Error('Missing required root element: "#root"');
    }
    ReactDOM.createRoot(root).render(
      <StrictMode>
        <AppErrorBoundary>
          <BootGate>
            <App />
          </BootGate>
        </AppErrorBoundary>
      </StrictMode>
    );
  } catch (e) {
    renderBootFailure(e, "react_mount_failed");
  }
}
