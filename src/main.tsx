import "./native/installNativeFetch";
import "./lib/iosSafetyShim";
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
import { isCapacitorNative } from "@/lib/platform/isNative";
import { loadAnalyticsScripts } from "@/lib/analyticsLoader";

const showBootDetails = !__MBS_NATIVE_RELEASE__;
const allowBootOverlay = true;
const isNativeBuild = isCapacitorNative();
const ENV = (import.meta as any)?.env || {};
const NATIVE_ALLOWED_SCRIPT_ORIGINS = new Set<string>(
  (ENV.VITE_NATIVE_ALLOWED_SCRIPT_ORIGINS as string | undefined)
    ?.split(",")
    .map((entry: string) => entry.trim())
    .filter(Boolean)
);

if (typeof window !== "undefined") {
  NATIVE_ALLOWED_SCRIPT_ORIGINS.add(window.location.origin);
}

function installNativeCspPolicy() {
  if (typeof document === "undefined") return;
  if (!isCapacitorNative()) return;
  const meta =
    document.querySelector<HTMLMetaElement>(
      'meta[http-equiv="Content-Security-Policy"]'
    ) ?? document.createElement("meta");
  meta.setAttribute("http-equiv", "Content-Security-Policy");
  const connectSrc = [
    "'self'",
    "capacitor://localhost",
    "https://mybodyscanapp.com",
    "https://*.mybodyscanapp.com",
    "https://identitytoolkit.googleapis.com",
    "https://securetoken.googleapis.com",
    "https://www.googleapis.com",
    "https://*.googleapis.com",
  ].join(" ");
  meta.setAttribute(
    "content",
    `script-src 'self'; connect-src ${connectSrc};`
  );
  if (!meta.parentNode) {
    document.head.appendChild(meta);
  }
}

function isAllowedNativeScriptSrc(value: string) {
  if (!isNativeBuild) return true;
  if (!value) return true;
  try {
    const url = new URL(value, window.location.href);
    if (url.origin === window.location.origin) return true;
    return NATIVE_ALLOWED_SCRIPT_ORIGINS.has(url.origin);
  } catch {
    return true;
  }
}

function installNativeDiagnosticsListeners() {
  if (!isNativeBuild || typeof window === "undefined") return;
  const anyWin = window as any;
  if (anyWin.__mbsNativeDiagnosticsInstalled) return;
  anyWin.__mbsNativeDiagnosticsInstalled = true;

  window.addEventListener(
    "error",
    (event: Event) => {
      if (!(event instanceof ErrorEvent)) return;
      const err = event.error as Error | undefined;
      // eslint-disable-next-line no-console
      console.error("JS_ERROR", {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        stack: err?.stack,
      });
    },
    true
  );

  window.addEventListener(
    "unhandledrejection",
    (event: PromiseRejectionEvent) => {
      const reason = event.reason as Error | undefined;
      // eslint-disable-next-line no-console
      console.error("JS_REJECTION", {
        reason: reason instanceof Error ? reason.message : String(reason),
        stack: reason?.stack,
      });
    },
    true
  );
}

function installBootErrorListeners() {
  if (typeof window === "undefined") return;
  const anyWin = window as any;
  if (anyWin.__mbsBootErrorListenersInstalled) return;
  anyWin.__mbsBootErrorListenersInstalled = true;

  window.addEventListener(
    "error",
    (event: Event) => {
      const target = event.target as HTMLElement | null;
      if (!target || target === window) return;
      const src = (target as HTMLScriptElement).src;
      const href = (target as HTMLLinkElement).href;
      if (!src && !href) return;
      if (__MBS_NATIVE_RELEASE__) {
        // eslint-disable-next-line no-console
        console.error("[boot] resource_error (release)", {
          tagName: target.tagName,
        });
        return;
      }
      // eslint-disable-next-line no-console
      console.error("[boot] resource_error", {
        tagName: target.tagName,
        src,
        href,
      });
    },
    true
  );

  window.addEventListener(
    "error",
    (event: ErrorEvent) => {
      if (isGenericScriptError(event)) {
        if (!__MBS_NATIVE_RELEASE__) {
          console.warn("[boot] window_error_ignored generic_script_error", {
            message: event.message,
            line: event.lineno,
            col: event.colno,
          });
        }
        return;
      }
      if (__MBS_NATIVE_RELEASE__) {
        // eslint-disable-next-line no-console
        console.error("[boot] window error (release):", event.message);
        return;
      }
      const err = event.error as Error | undefined;
      // eslint-disable-next-line no-console
      console.error("[boot] window error:", {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        stack: err?.stack,
      });
    },
    true
  );

  window.addEventListener(
    "unhandledrejection",
    (event: PromiseRejectionEvent) => {
      const reason = event.reason as Error | undefined;
      if (__MBS_NATIVE_RELEASE__) {
        // eslint-disable-next-line no-console
        console.error("[boot] unhandledrejection (release)");
        return;
      }
      // eslint-disable-next-line no-console
      console.error("[boot] unhandledrejection:", {
        reason,
        stack: reason?.stack,
      });
    },
    true
  );
}

installNativeDiagnosticsListeners();
installBootErrorListeners();
installNativeCspPolicy();

function installScriptCreationDiagnostics() {
  if (typeof document === "undefined" || typeof window === "undefined") return;
  const anyWin = window as any;
  if (anyWin.__mbsScriptGuardInstalled) return;
  anyWin.__mbsScriptGuardInstalled = true;

  const originalCreateElement = document.createElement.bind(document);
  document.createElement = ((tagName: string, options?: ElementCreationOptions) => {
    const element = originalCreateElement(tagName, options);
    if (typeof tagName === "string" && tagName.toLowerCase() === "script") {
      const scriptEl = element as HTMLScriptElement;
      const originalSetAttribute = scriptEl.setAttribute.bind(scriptEl);

      const applySrc = (value: string, assign: (val: string) => void) => {
        if (!isAllowedNativeScriptSrc(value)) {
          if (!__MBS_NATIVE_RELEASE__) {
            console.warn("[boot] blocked_external_script", { src: value });
          }
          return;
        }
        if (!__MBS_NATIVE_RELEASE__) {
          console.warn("[boot] script_create", { src: value });
        }
        assign(value);
      };

      scriptEl.setAttribute = (name: string, value: string) => {
        if (name.toLowerCase() === "src") {
          applySrc(value, (val) => originalSetAttribute(name, val));
          return;
        }
        originalSetAttribute(name, value);
      };

      const proto = Object.getPrototypeOf(scriptEl);
      const descriptor = Object.getOwnPropertyDescriptor(proto, "src");
      if (descriptor?.set && descriptor?.get) {
        Object.defineProperty(scriptEl, "src", {
          configurable: true,
          enumerable: true,
          get() {
            return descriptor.get?.call(scriptEl);
          },
          set(value) {
            applySrc(String(value ?? ""), (val) => {
              descriptor.set?.call(scriptEl, val);
            });
          },
        });
      }
    }
    return element;
  }) as typeof document.createElement;
}

if (isNativeBuild || import.meta.env.DEV) {
  installScriptCreationDiagnostics();
}

function logExternalScriptOriginsOnce() {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const anyWin = window as any;
  if (anyWin.__mbsExternalScriptOriginsLogged) return;
  anyWin.__mbsExternalScriptOriginsLogged = true;

  const origins = new Set<string>();
  for (const script of Array.from(document.scripts || [])) {
    if (!script.src) continue;
    try {
      const url = new URL(script.src, window.location.href);
      if (url.origin !== window.location.origin) {
        origins.add(url.origin);
      }
    } catch {
      // ignore
    }
  }
  const list = Array.from(origins).slice(0, 10);
  if (!__MBS_NATIVE_RELEASE__) {
    console.warn("[boot] external_script_origins", list);
  }
}

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
        {showBootDetails ? (
          <>
            <div style={muted}>{failure.message}</div>
            {failure.stack ? <pre style={pre}>{failure.stack}</pre> : null}
          </>
        ) : null}
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

function renderBootFailure(
  error: unknown,
  code?: string,
  options?: { allowInRelease?: boolean }
) {
  // Crash shield is native-only to prevent blank white screens in WKWebView.
  if (!isCapacitorNative()) return;
  if (typeof window === "undefined") return;
  if (!allowBootOverlay) {
    const failure = normalizeBootFailure(error, code);
    // eslint-disable-next-line no-console
    console.error("[boot] fatal (suppressed in release):", failure.code);
    return;
  }
  if (__MBS_NATIVE_RELEASE__ && !options?.allowInRelease) {
    const failure = normalizeBootFailure(error, code);
    // eslint-disable-next-line no-console
    console.error("[boot] fatal (release suppressed):", failure.code);
    return;
  }
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
      pre.textContent = showBootDetails
        ? `App failed to start (${failure.code})\n\n${failure.message}\n\n${failure.stack || ""}`
        : "App failed to start.";
      root.appendChild(pre);
    } catch {
      // ignore
    }
  }
}

function isGenericScriptError(event: ErrorEvent) {
  return (
    event.message === "Script error." &&
    event.lineno === 0 &&
    event.colno === 0 &&
    (!event.filename || event.filename === "")
  );
}

function getLoadedScriptSources(): string[] {
  if (typeof document === "undefined") return [];
  try {
    return Array.from(document.scripts || [])
      .map((script) => script.src || "[inline]")
      .filter(Boolean);
  } catch {
    return [];
  }
}

function logBootScriptSourcesOnce() {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const anyWin = window as any;
  if (anyWin.__mbsBootScriptSourcesLogged) return;
  anyWin.__mbsBootScriptSourcesLogged = true;

  const scripts = getLoadedScriptSources();
  if (!scripts.length) return;
  if (!__MBS_NATIVE_RELEASE__) {
    console.warn("[boot] script_sources", scripts);
  }
}

function isSameOriginFilename(filename?: string) {
  if (!filename || typeof window === "undefined") return false;
  try {
    const url = new URL(filename, window.location.href);
    return url.origin === window.location.origin;
  } catch {
    return false;
  }
}

function shouldRenderBootOverlayFromError(event: ErrorEvent) {
  if (!allowBootOverlay) return false;
  const err = event.error as Error | undefined;
  const hasStack = Boolean((err as any)?.stack);
  const hasError = Boolean(err);
  const sameOrigin = isSameOriginFilename(event.filename);
  return hasError || sameOrigin || hasStack;
}

function shouldRenderBootOverlayFromRejection(event: PromiseRejectionEvent) {
  if (!allowBootOverlay) return false;
  const reason = event.reason as any;
  const hasStack = Boolean(reason?.stack);
  const isError = reason instanceof Error;
  return isError || hasStack;
}

try {
  assertEnv();
} catch (e) {
  renderBootFailure(e, "env_assert_failed", { allowInRelease: true });
}

// Telemetry should initialize on both web and native.
if (typeof window !== "undefined") {
  try {
    initTelemetry();
  } catch (e) {
    renderBootFailure(e, "telemetry_init_failed", { allowInRelease: true });
  }
}

if (typeof window !== "undefined") {
  loadAnalyticsScripts({ isNativeBuild });
  try {
    logBootScriptSourcesOnce();
    logExternalScriptOriginsOnce();
  } catch {
    // ignore
  }
}

// Boot error trap to capture first thrown error before any UI swallows it.
// Native-only (per crash-shield spec) to prevent WKWebView blank screens.
if (typeof window !== "undefined" && isCapacitorNative()) {
  installBootErrorListeners();

  window.addEventListener(
    "error",
    (event: ErrorEvent) => {
      try {
        if (isGenericScriptError(event)) {
          if (!__MBS_NATIVE_RELEASE__) {
            console.warn("[boot] window_error_ignored generic_script_error", {
              reason: "generic_script_error",
              message: event.message,
              filename: event.filename,
              lineno: event.lineno,
              colno: event.colno,
              userAgent:
                typeof navigator !== "undefined" ? navigator.userAgent : "n/a",
              location:
                typeof window !== "undefined" ? window.location.href : "n/a",
              scripts: getLoadedScriptSources(),
            });
          }
          return;
        }
        if (!(window as any).__firstBootError) {
          (window as any).__firstBootError = true;
          if (!__MBS_NATIVE_RELEASE__) {
            console.error(
              "[boot] first error:",
              event.error || event.message,
              event.filename,
              event.lineno,
              event.colno,
              (event.error as any)?.stack
            );
          } else {
            console.error("[boot] first error (release):", event.message);
          }
        }
        if (!shouldRenderBootOverlayFromError(event)) {
          if (!__MBS_NATIVE_RELEASE__) {
            console.warn("[boot] window_error_suppressed", {
              message: event.message,
              filename: event.filename,
              lineno: event.lineno,
              colno: event.colno,
              hasError: Boolean(event.error),
              hasStack: Boolean((event.error as any)?.stack),
              sameOrigin: isSameOriginFilename(event.filename),
            });
          }
          return;
        }
        renderBootFailure(event.error || event.message, "window_error");
      } catch {
        // ignore
      }
    },
    true
  );

  window.addEventListener(
    "unhandledrejection",
    (event: PromiseRejectionEvent) => {
      try {
        if (!(window as any).__firstBootError) {
          (window as any).__firstBootError = true;
          if (!__MBS_NATIVE_RELEASE__) {
            console.error("[boot] first unhandledrejection:", event?.reason);
          } else {
            console.error("[boot] first unhandledrejection (release)");
          }
        }
        if (!shouldRenderBootOverlayFromRejection(event)) {
          if (!__MBS_NATIVE_RELEASE__) {
            console.warn("[boot] unhandledrejection_suppressed", {
              reason: event?.reason,
            });
          }
          return;
        }
        renderBootFailure(event?.reason || event, "unhandled_rejection");
      } catch {
        // ignore
      }
    },
    true
  );
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
    renderBootFailure(e, "react_mount_failed", { allowInRelease: true });
  }
}
