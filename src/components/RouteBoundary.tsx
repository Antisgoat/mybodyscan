import { Component, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";

interface RouteBoundaryProps {
  children: ReactNode;
}

interface RouteBoundaryState {
  hasError: boolean;
  error?: Error;
}

export class RouteBoundary extends Component<
  RouteBoundaryProps,
  RouteBoundaryState
> {
  state: RouteBoundaryState = { hasError: false };

  static getDerivedStateFromError(error: Error): RouteBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    console.error("[route-boundary]", error);
    toast({
      title: "Something went wrong",
      description: error.message,
      variant: "destructive",
    });
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[240px] flex-col items-center justify-center gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-6 text-center">
          <div className="text-sm font-medium text-destructive">
            We hit a snag loading this view.
          </div>
          {this.state.error && (
            <div className="text-xs text-muted-foreground">
              {this.state.error.message}
            </div>
          )}
          <Button size="sm" variant="outline" onClick={this.handleReset}>
            Try again
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
