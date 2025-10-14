import { useEffect, useState } from "react";

const CHECK_INTERVAL_MS = 60_000;

type HealthStatus = "checking" | "ok" | "warn";

function statusLabel(status: HealthStatus): string {
  switch (status) {
    case "ok":
      return "Systems OK";
    case "warn":
      return "Check systems";
    default:
      return "Checking systems…";
  }
}

function statusColor(status: HealthStatus): string {
  switch (status) {
    case "ok":
      return "bg-emerald-500";
    case "warn":
      return "bg-amber-500";
    default:
      return "bg-muted-foreground animate-pulse";
  }
}

export function SystemHealthIndicator() {
  const [status, setStatus] = useState<HealthStatus>("checking");

  useEffect(() => {
    let active = true;
    let controller: AbortController | null = null;

    const runCheck = async () => {
      controller?.abort();
      const next = new AbortController();
      controller = next;
      try {
        const response = await fetch("/system/health", {
          method: "GET",
          credentials: "include",
          cache: "no-store",
          signal: next.signal,
        });
        if (!active) return;
        setStatus(response.ok ? "ok" : "warn");
      } catch (error) {
        if (!active || next.signal.aborted) return;
        if (import.meta.env.DEV) {
          console.warn("[health] status check failed", error);
        }
        setStatus("warn");
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void runCheck();
      }
    };

    void runCheck();

    const interval = window.setInterval(() => {
      void runCheck();
    }, CHECK_INTERVAL_MS);

    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      active = false;
      controller?.abort();
      document.removeEventListener("visibilitychange", handleVisibility);
      window.clearInterval(interval);
    };
  }, []);

  return (
    <div
      className="flex items-center gap-1 text-xs text-muted-foreground"
      title={statusLabel(status)}
      role="status"
      aria-live="polite"
    >
      <span className={`inline-flex h-2.5 w-2.5 rounded-full ${statusColor(status)}`} />
      <span className="hidden sm:inline">{statusLabel(status)}</span>
    </div>
  );
}
