import { Loader2 } from "lucide-react";
import { cn } from "@app/lib/utils.ts";

interface LoadingOverlayProps {
  label?: string;
  className?: string;
}

export function LoadingOverlay({ label = "Loading…", className }: LoadingOverlayProps) {
  return (
    <div className={cn("flex min-h-[240px] flex-col items-center justify-center gap-3 p-6", className)}>
      <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
      <span className="text-sm text-muted-foreground">{label}</span>
    </div>
  );
}
