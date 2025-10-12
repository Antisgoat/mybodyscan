import { Component, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { hasError: boolean; message?: string };

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: unknown) {
    return { hasError: true, message: (error as Error)?.message ?? "Unknown error" };
  }

  componentDidCatch(error: unknown, info: unknown) {
    console.error("App crashed:", error, info);
    // TODO: add Sentry/logger here if available
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24, maxWidth: 520, margin: "0 auto", textAlign: "center" }}>
          <h2 style={{ fontSize: "1.5rem", marginBottom: 12 }}>We hit a snag.</h2>
          <p style={{ marginBottom: 16, color: "#475467" }}>
            Try reload. If this persists, use “Explore demo” from the Auth page.
          </p>
          {this.state.message ? (
            <p style={{ marginBottom: 20, color: "#6b7280", fontSize: "0.9rem" }}>
              Details: {this.state.message}
            </p>
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
