import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type HealthResponse = {
  hasOpenAI: boolean;
  model: string | null;
  hasStripe: boolean;
  appCheckSoft: boolean;
  host: string | null;
};

function formatHost(host: string | null | undefined) {
  if (!host) {
    return "Not configured";
  }
  return host;
}

export default function SystemCheck() {
  const [status, setStatus] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function load() {
      try {
        setLoading(true);
        const response = await fetch("/system/health", {
          method: "GET",
          credentials: "include",
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`Request failed (${response.status})`);
        }
        const payload = (await response.json()) as HealthResponse;
        if (cancelled) return;
        setStatus(payload);
        setError(null);
      } catch (err: any) {
        if (cancelled || err?.name === "AbortError") {
          return;
        }
        setError("Unable to load system health. Try again later.");
        setStatus(null);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  const openAiBadge = status
    ? status.hasOpenAI
      ? "Configured"
      : "Missing (scans disabled)"
    : loading
    ? "Checking…"
    : "Unknown";

  const stripeBadge = status
    ? status.hasStripe
      ? "Configured"
      : "Disabled (501)"
    : loading
    ? "Checking…"
    : "Unknown";

  const appCheckBadge = status
    ? status.appCheckSoft
      ? "Soft"
      : "Strict"
    : loading
    ? "Checking…"
    : "Unknown";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div
        className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10"
        data-testid="system-health"
      >
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold">System Check</h1>
          <p className="text-sm text-muted-foreground">
            Verify integrations required for production scans.
          </p>
        </div>
        {error ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}
        <div className="grid gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle>OpenAI</CardTitle>
                <CardDescription>Vision API access for scan processing.</CardDescription>
              </div>
              <Badge variant={status ? (status.hasOpenAI ? "default" : "destructive") : "outline"}>
                {openAiBadge}
              </Badge>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {status?.hasOpenAI
                  ? `OPENAI_API_KEY detected. Scans will use ${status?.model || "gpt-4o-mini"}.`
                  : "Set OPENAI_API_KEY as a Firebase Functions variable before enabling scans."}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle>Stripe</CardTitle>
                <CardDescription>Payments remain optional.</CardDescription>
              </div>
              <Badge variant={status ? (status.hasStripe ? "default" : "secondary") : "outline"}>
                {stripeBadge}
              </Badge>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {status?.hasStripe
                  ? "Stripe keys detected. Payment endpoints will be enabled."
                  : "Without Stripe keys, payment endpoints respond with HTTP 501."}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle>App Check</CardTitle>
                <CardDescription>Enforcement mode for browser clients.</CardDescription>
              </div>
              <Badge variant={status ? (status.appCheckSoft ? "default" : "secondary") : "outline"}>
                {appCheckBadge}
              </Badge>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {status?.appCheckSoft
                  ? "Soft enforcement: requests log warnings but are allowed."
                  : "Strict enforcement: invalid App Check tokens receive HTTP 403."}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Host Base URL</CardTitle>
              <CardDescription>Value used for absolute links.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm">
                <span className="font-medium">Host:</span> {status ? formatHost(status.host) : loading ? "Checking…" : "Unknown"}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
