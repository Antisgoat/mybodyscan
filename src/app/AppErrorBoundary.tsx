import { Component, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { hasError: boolean; msg?: string };

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };
  static getDerivedStateFromError(err: unknown): State {
    return { hasError: true, msg: err instanceof Error ? err.message : String(err) };
  }
  componentDidCatch(err: unknown, info: unknown) {
     
    console.error("App crashed:", err, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 text-sm">
          <div className="font-medium mb-2">We hit a snag starting the app.</div>
          <pre className="overflow-auto rounded border p-3 text-xs">{String(this.state.msg || "Unknown error")}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}
