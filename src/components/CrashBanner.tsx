import { useState, useEffect } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertTriangle, X } from "lucide-react";

export function CrashBanner() {
  const [error, setError] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const shouldIgnore = (detail: unknown) => {
      const source = (detail as any)?.reason ?? (detail as any)?.error ?? detail;
      if (!source || typeof source !== "object") return false;
      const status = (source as any).status;
      const code = (source as any).code;
      if (typeof status === "number" && status >= 400 && status < 600) return true;
      if (typeof code === "string" && status !== undefined) return true;
      return false;
    };

    const handleError = (event: ErrorEvent | PromiseRejectionEvent) => {
      const detail = event instanceof PromiseRejectionEvent ? event.reason : event.error;
      if (shouldIgnore(detail)) {
        return;
      }
      console.error("App crash detected:", event);
      setError("App failed to start. Check console for details.");
      setIsVisible(true);
    };

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleError);

    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleError);
    };
  }, []);

  if (!isVisible || !error) return null;

  return (
    <Alert className="m-4 border-destructive/50 text-destructive">
      <AlertTriangle className="h-4 w-4" />
      <AlertDescription className="flex items-center justify-between">
        <span>{error}</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsVisible(false)}
          className="h-auto p-1 text-destructive hover:text-destructive"
        >
          <X className="h-4 w-4" />
        </Button>
      </AlertDescription>
    </Alert>
  );
}