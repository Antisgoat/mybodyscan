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
        <div style={{ padding: 24 }}>
          <h2>Something went wrong</h2>
          <p>{this.state.message}</p>
          <button onClick={() => (window.location.href = "/")}>Reload</button>
        </div>
      );
    }

    return this.props.children;
  }
}
