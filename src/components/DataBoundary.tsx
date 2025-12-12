import { Component, ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface DataBoundaryProps {
  children: ReactNode;
  page: "nutrition" | "scan" | "coach";
}

interface DataBoundaryState {
  hasError: boolean;
  message?: string;
}

const PAGE_COPY: Record<
  DataBoundaryProps["page"],
  { title: string; description: string }
> = {
  nutrition: {
    title: "We couldn't load your nutrition data",
    description: "It looks like your profile info isn't ready yet.",
  },
  scan: {
    title: "We couldn't load your scan data",
    description: "Your recent scan details are still syncing.",
  },
  coach: {
    title: "We couldn't load your coach",
    description: "We're waiting on your profile to finish loading.",
  },
};

function shouldHandleError(error: Error): boolean {
  const message = String(error?.message || "").toLowerCase();
  if (error.name === "TypeError") return true;
  if (!message) return false;
  return (
    message.includes("profile") ||
    message.includes("user") ||
    message.includes("undefined") ||
    message.includes("missing")
  );
}

export class DataBoundary extends Component<
  DataBoundaryProps,
  DataBoundaryState
> {
  state: DataBoundaryState = { hasError: false };

  componentDidCatch(error: Error) {
    if (shouldHandleError(error)) {
      console.warn("[data-boundary]", error);
      this.setState({ hasError: true, message: error?.message });
      return;
    }
    throw error;
  }

  private handleRetry = () => {
    this.setState({ hasError: false, message: undefined });
  };

  render() {
    if (this.state.hasError) {
      const copy = PAGE_COPY[this.props.page];
      return (
        <div className="flex min-h-[280px] flex-col items-center justify-center gap-3 rounded-lg border border-border/60 bg-muted/30 p-6 text-center">
          <div className="text-base font-medium text-foreground">
            {copy.title}
          </div>
          <p className="text-sm text-muted-foreground">{copy.description}</p>
          {this.state.message && (
            <p className="text-xs text-muted-foreground/80">
              {this.state.message}
            </p>
          )}
          <Button size="sm" onClick={this.handleRetry} variant="secondary">
            Try again
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
