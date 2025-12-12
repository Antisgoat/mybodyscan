import { Component, type ErrorInfo, type ReactNode } from "react";

import { getCachedAuth } from "@/lib/auth";
import { isDemoAllowed } from "@/state/demo";

type Props = { children: ReactNode };
type State = { hasError: boolean; message?: string; stack?: string };

const SUPPORT_EMAIL = "support@mybodyscan.com";
const CRASH_LOGGED_FLAG = "__mbs_app_crash_logged__";

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: unknown) {
    const normalizedError =
      error instanceof Error
        ? error
        : new Error(typeof error === "string" ? error : "Unknown error");
    return {
      hasError: true,
      message: normalizedError.message ?? "Unknown error",
      stack: normalizedError.stack,
    };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    const normalizedError =
      error instanceof Error
        ? error
        : new Error(typeof error === "string" ? error : "Unknown error");
    const auth = getCachedAuth();
    const user = auth?.currentUser;
    const location =
      typeof window !== "undefined" ? window.location.href : undefined;
    const demo = isDemoAllowed(user ?? null);
    // Prevent log spam if React repeatedly re-throws during a crash loop.
    try {
      const w = window as any;
      if (w && w[CRASH_LOGGED_FLAG]) return;
      if (w) w[CRASH_LOGGED_FLAG] = true;
    } catch {
      // ignore
    }

    const normalizedStack = normalizedError.stack || this.state.stack;
    console.error("App crashed:", {
      message: normalizedError.message,
      stack: normalizedStack,
      componentStack: info?.componentStack,
      context: {
        location,
        user: user
          ? {
              uid: user.uid,
              isAnonymous: user.isAnonymous,
              email: user.email,
            }
          : null,
        demoMode: demo,
      },
    });
    // TODO: add Sentry/logger here if available
  }

  render() {
    if (this.state.hasError) {
      const shouldShowStack = import.meta.env.DEV && this.state.stack;
      return (
        <div
          style={{
            padding: 24,
            maxWidth: 520,
            margin: "0 auto",
            textAlign: "center",
          }}
        >
          <h2 style={{ fontSize: "1.5rem", marginBottom: 12 }}>
            We hit a snag.
          </h2>
          <p style={{ marginBottom: 16, color: "#475467" }}>
            Try reload. If this persists, use “Explore demo” from the Auth page.
          </p>
          {this.state.message ? (
            <p
              style={{ marginBottom: 20, color: "#6b7280", fontSize: "0.9rem" }}
            >
              Details: {this.state.message}
            </p>
          ) : null}
          <p style={{ marginBottom: 20, color: "#6b7280", fontSize: "0.9rem" }}>
            Need a hand?{" "}
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              style={{ color: "#2563eb", textDecoration: "underline" }}
            >
              Contact support
            </a>
            .
          </p>
          {shouldShowStack ? (
            <details style={{ textAlign: "left", marginTop: 16 }}>
              <summary style={{ cursor: "pointer", marginBottom: 8 }}>
                Technical details
              </summary>
              <pre
                style={{
                  overflowX: "auto",
                  padding: 12,
                  background: "#f3f4f6",
                  borderRadius: 6,
                  fontSize: "0.8rem",
                  lineHeight: 1.4,
                  color: "#1f2933",
                }}
              >
                {this.state.stack}
              </pre>
            </details>
          ) : null}
          <button
            onClick={() => (window.location.href = "/")}
            style={{
              padding: "10px 16px",
              borderRadius: 8,
              border: "none",
              background: "#2563eb",
              color: "white",
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
