import {
  Component,
  type CSSProperties,
  type ErrorInfo,
  type ReactNode,
} from "react";

type Props = { children: ReactNode };
type State = { hasError: boolean; message?: string };

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: "" };

  static getDerivedStateFromError(error: unknown): State {
    const message =
      error && typeof error === "object" && "message" in error
        ? String((error as { message?: unknown }).message)
        : "Something went wrong.";
    return { hasError: true, message };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error("[ui] error boundary:", error, info);
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
