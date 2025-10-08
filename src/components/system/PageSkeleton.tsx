import type { HTMLAttributes } from "react";

interface PageSkeletonProps extends HTMLAttributes<HTMLDivElement> {
  label?: string;
}

export function PageSkeleton({ label = "Loading…", className = "", ...divProps }: PageSkeletonProps) {
  return (
    <div
      className={`min-h-screen w-full flex items-center justify-center bg-background ${className}`.trim()}
      role="status"
      aria-live="polite"
      {...divProps}
    >
      <div className="flex flex-col items-center gap-3 text-center">
        <span
          className="h-8 w-8 rounded-full border-2 border-muted-foreground/40 border-t-primary animate-spin"
          aria-hidden="true"
        />
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}
