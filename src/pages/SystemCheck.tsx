import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type SystemHealthResponse = {
  hasOpenAI: boolean;
  hasStripe: boolean;
  appCheckSoft: boolean;
  host?: string;
};

type FetchState = "idle" | "loading" | "success" | "error";

const QUICK_LINKS = [
  { to: "/scan", label: "Scan" },
  { to: "/nutrition", label: "Nutrition" },
  { to: "/coach", label: "Coach" },
  { to: "/settings", label: "Settings" },
];

function formatError(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === "string" && error) {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch (_) {
    return "Unable to reach system health endpoint.";
  }
}

const SystemCheck = () => {
  const [health, setHealth] = useState<SystemHealthResponse | null>(null);
  const [state, setState] = useState<FetchState>("idle");
  const [error, setError] = useState<string | null>(null);

  const candidateUrls = useMemo(() => {
    const urls = new Set<string>();
    const rawBase = import.meta.env.VITE_API_BASE;
    if (typeof rawBase === "string" && rawBase.trim()) {
      const trimmed = rawBase.trim().replace(/\/+$/, "");
      if (trimmed.length > 0) {
        urls.add(`${trimmed}/system/health`);
      }
    } else {
      urls.add("/api/system/health");
    }
    urls.add("/api/system/health");
    urls.add("/system/health");
    return Array.from(urls);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const controllers: AbortController[] = [];

    const run = async () => {
      setState("loading");
      setError(null);
      setHealth(null);
      let lastError: unknown = null;

      for (const url of candidateUrls) {
        try {
          const controller = new AbortController();
          controllers.push(controller);
          const response = await fetch(url, {
            method: "GET",
            headers: { Accept: "application/json" },
            signal: controller.signal,
          });
          if (!response.ok) {
            throw new Error(`system_health_${response.status}`);
          }
          const data = (await response.json()) as SystemHealthResponse;
          if (!cancelled) {
            setHealth(data);
            setState("success");
            setError(null);
          }
          return;
        } catch (err) {
          if ((err as Error)?.name === "AbortError") {
            return;
          }
          lastError = err;
        }
      }

      if (!cancelled) {
        setState("error");
        setError(formatError(lastError));
        setHealth(null);
      }
    };

    void run();

    return () => {
      cancelled = true;
      controllers.forEach((controller) => controller.abort());
    };
  }, [candidateUrls]);

  return (
    <div
      className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8"
      data-testid="system-health"
    >
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">System health</h1>
        <p className="text-muted-foreground">
          Confirm critical configuration before running scans. Refresh this page to update the
          flags.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          {state === "loading" ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              <span>Checking system health…</span>
            </div>
          ) : null}

          {state === "error" && error ? (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4" aria-hidden="true" />
              <div>
                <p className="font-medium">Request failed</p>
                <p className="text-muted-foreground">{error}</p>
              </div>
            </div>
          ) : null}

          {state === "success" && health ? (
            <div className="flex flex-col gap-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <StatusTile
                  label="OpenAI"
                  ok={health.hasOpenAI}
                  okLabel="Configured"
                  failLabel="Missing (scans will mock)"
                />
                <StatusTile
                  label="Stripe"
                  ok={health.hasStripe}
                  okLabel="Configured"
                  failLabel="Disabled (501)"
                />
                <AppCheckTile soft={health.appCheckSoft} />
              </div>
              {health.host ? (
                <p className="text-sm text-muted-foreground">
                  Reporting host: <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{health.host}</code>
                </p>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Quick links</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {QUICK_LINKS.map((link) => (
            <Button key={link.to} asChild variant="outline">
              <Link to={link.to}>{link.label}</Link>
            </Button>
          ))}
        </CardContent>
      </Card>

      {state === "error" ? (
        <p className="text-sm text-muted-foreground">
          Ensure Hosting rewrites route <code>/system/health</code> (and <code>/api/system/health</code>) to the
          Functions endpoint or override <code>VITE_API_BASE</code> with the deployed base URL.
        </p>
      ) : null}
    </div>
  );
};

type StatusTileProps = {
  label: string;
  ok: boolean;
  okLabel: string;
  failLabel: string;
};

function StatusTile({ label, ok, okLabel, failLabel }: StatusTileProps) {
  return (
    <div className="rounded-md border border-border bg-muted/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <Badge
          className={cn(
            "border-none",
            ok
              ? "bg-emerald-500 text-white hover:bg-emerald-500"
              : "bg-destructive text-destructive-foreground hover:bg-destructive"
          )}
        >
          {ok ? okLabel : failLabel}
        </Badge>
      </div>
    </div>
  );
}

function AppCheckTile({ soft }: { soft: boolean }) {
  return (
    <div className="rounded-md border border-border bg-muted/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-foreground">App Check</p>
        <Badge
          className={cn(
            "border-none",
            soft
              ? "bg-amber-500 text-amber-950 hover:bg-amber-500"
              : "bg-emerald-500 text-white hover:bg-emerald-500"
          )}
        >
          {soft ? "Soft" : "Strict"}
        </Badge>
      </div>
    </div>
  );
}

export default SystemCheck;
