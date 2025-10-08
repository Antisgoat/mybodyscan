import { Component, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface ErrorBoundaryProps {
  children: ReactNode;
  title?: string;
  description?: string;
  onRetry?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage?: string;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, errorMessage: error?.message };
  }

  componentDidCatch(error: Error, info: any) {
    if (import.meta.env.DEV) {
      console.warn("[error-boundary]", error, info);
    }
  }

  private handleRetry = () => {
    this.setState({ hasError: false, errorMessage: undefined });
    this.props.onRetry?.();
  };

  override render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="min-h-[240px] flex flex-col items-center justify-center gap-4 rounded-lg border border-border/60 bg-muted/40 p-6 text-center">
          <div className="space-y-1">
            <p className="text-base font-semibold text-foreground">
              {this.props.title ?? "Something went wrong"}
            </p>
            <p className="text-sm text-muted-foreground">
              {this.props.description ?? "We hit a snag loading this page. Try again in a moment."}
            </p>
            {this.state.errorMessage ? (
              <p className="text-xs text-muted-foreground/80">{this.state.errorMessage}</p>
            ) : null}
          </div>
          <Button size="sm" variant="secondary" onClick={this.handleRetry}>
            Retry
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
