import { Component, type ReactNode } from "react";
import { reportError } from "@/lib/sentry";

type Props = { children: ReactNode };
type State = { hasError: boolean; message?: string; error?: Error };

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: unknown) {
    if (error instanceof Error) {
      return { hasError: true, message: error.message } satisfies Partial<State>;
    }
    return { hasError: true, message: typeof error === "string" ? error : "Unknown error" } satisfies Partial<State>;
  }

  componentDidCatch(error: unknown, info: unknown) {
    console.error("App crashed:", error, info);
    this.setState({ error: error instanceof Error ? error : new Error(String(error)) });
    
    // Report to Sentry if available
    if (error instanceof Error) {
      reportError(error, {
        component: 'AppErrorBoundary',
        errorInfo: info,
      });
    }
  }

  render() {
    if (this.state.hasError) {
      const stack = import.meta.env.DEV ? this.state.error?.stack : undefined;
      return (
        <div className="min-h-screen bg-background text-foreground">
          <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6 text-center">
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold">Something went wrong</h1>
              <p className="text-sm text-muted-foreground">
                We hit an unexpected error. Reload to try again, or check system status.
              </p>
            </div>
            {this.state.message && (
              <pre className="overflow-x-auto whitespace-pre-wrap rounded-md bg-muted/60 p-4 text-left text-sm text-muted-foreground">
                {this.state.message}
              </pre>
            )}
            {stack && (
              <details className="text-left">
                <summary className="cursor-pointer text-sm font-medium text-muted-foreground">
                  Stack trace (dev only)
                </summary>
                <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-md bg-muted/60 p-4 text-xs text-muted-foreground">
                  {stack}
                </pre>
              </details>
            )}
            <div className="flex flex-wrap justify-center gap-3">
              <button
                type="button"
                className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
                onClick={() => {
                  window.location.href = "/";
                }}
              >
                Go home
              </button>
              <button
                type="button"
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90"
                onClick={() => window.location.reload()}
              >
                Retry
              </button>
              <a
                href="/system/health"
                className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
              >
                View system health
              </a>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
