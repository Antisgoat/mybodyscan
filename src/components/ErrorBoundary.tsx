import {
  Component,
  type CSSProperties,
  type ErrorInfo,
  type ReactNode,
} from "react";
import { reportError } from "@/lib/telemetry";

type Props = { children: ReactNode };
type State = { hasError: boolean; message?: string; details?: string };

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: "", details: "" };

  static getDerivedStateFromError(error: unknown): State {
    const message = formatErrorMessage(error);
    return { hasError: true, message, details: "" };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    const message = formatErrorMessage(error);
    const stack =
      error && typeof error === "object" && "stack" in error
        ? String((error as { stack?: unknown }).stack ?? "")
        : "";
    console.error("[ui] error boundary:", { message, error, info });
    void reportError({
      kind: "ui_crash",
      message,
      code: "ui_crash",
      extra: {
        componentStack: info?.componentStack ?? "",
      },
    });
    if (import.meta.env.DEV) {
      const details = [
        `message: ${message}`,
        stack ? `stack:\n${stack}` : "",
        info?.componentStack ? `componentStack:\n${info.componentStack}` : "",
      ]
        .filter(Boolean)
        .join("\n\n");
      this.setState({ details });
    }
  }

  private handleReload = () => {
    try {
      if (
        typeof window !== "undefined" &&
        typeof window.location?.reload === "function"
      ) {
        window.location.reload();
      } else if (
        typeof location !== "undefined" &&
        typeof location.reload === "function"
      ) {
        location.reload();
      }
    } catch {
      // ignore
    }
  };

  override render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div style={wrap}>
          <div style={card}>
            <div style={title}>Something went wrong</div>
            <div style={msg}>{this.state.message || "Unknown error"}</div>
            {import.meta.env.DEV && this.state.details ? (
              <details style={detailsStyle}>
                <summary style={summaryStyle}>Debug details (dev only)</summary>
                <pre style={pre}>{this.state.details}</pre>
              </details>
            ) : null}
            <button type="button" onClick={this.handleReload} style={btn}>
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function formatErrorMessage(error: unknown): string {
  if (!error) return "Something went wrong.";
  if (typeof error === "string") return error;
  if (typeof error === "object") {
    const anyErr = error as any;
    const code =
      typeof anyErr?.code === "string" && anyErr.code.trim().length
        ? anyErr.code.trim()
        : null;
    const message =
      typeof anyErr?.message === "string" && anyErr.message.trim().length
        ? anyErr.message.trim()
        : null;
    if (code && message && !message.includes(code)) return `${code}: ${message}`;
    if (message) return message;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return "Something went wrong.";
  }
}

const wrap: CSSProperties = {
  minHeight: "100vh",
  display: "grid",
  placeItems: "center",
  background: "#fafafa",
};

const card: CSSProperties = {
  maxWidth: 560,
  width: "90%",
  padding: 16,
  border: "1px solid #eee",
  borderRadius: 12,
  background: "white",
  boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
};

const title: CSSProperties = { fontWeight: 700, marginBottom: 8 };

const msg: CSSProperties = { color: "#555", fontSize: 13, marginBottom: 12 };

const btn: CSSProperties = {
  padding: "8px 10px",
  border: "1px solid #ddd",
  borderRadius: 8,
  background: "white",
  cursor: "pointer",
  fontSize: 12,
};

const detailsStyle: CSSProperties = {
  marginBottom: 12,
};

const summaryStyle: CSSProperties = {
  cursor: "pointer",
  fontSize: 12,
  color: "#555",
  marginBottom: 6,
};

const pre: CSSProperties = {
  whiteSpace: "pre-wrap",
  maxHeight: 240,
  overflow: "auto",
  fontSize: 11,
  padding: 10,
  borderRadius: 8,
  border: "1px solid #eee",
  background: "#fafafa",
};
