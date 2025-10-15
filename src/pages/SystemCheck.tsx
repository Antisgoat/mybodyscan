import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { OAuthProvider } from "firebase/auth";
import { isIOSWeb } from "@/lib/isIOSWeb";
import { loadFirebaseAuthClientConfig, isProviderEnabled } from "@/lib/firebaseAuthConfig";

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
  const [healthJson, setHealthJson] = useState<string>("");
  const [appleLikelyEnabled, setAppleLikelyEnabled] = useState<boolean | null>(null);
  const [sdkProviderConstructible, setSdkProviderConstructible] = useState<boolean>(false);
  const [spaCheckResult, setSpaCheckResult] = useState<null | { ok: boolean; status: number }>(null);
  const [spaCheckLoading, setSpaCheckLoading] = useState(false);

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
        setHealthJson(JSON.stringify(payload, null, 2));
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

  useEffect(() => {
    // Determine Apple provider state using Firebase client config with env fallback.
    let cancelled = false;
    setSdkProviderConstructible(false);
    try {
      // Presence of SDK provider is not proof of console enablement, but a useful hint.
      // It should not throw in modern SDKs.
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const provider = new OAuthProvider("apple.com");
      setSdkProviderConstructible(true);
    } catch {
      setSdkProviderConstructible(false);
    }

    loadFirebaseAuthClientConfig()
      .then((config) => {
        if (cancelled) return;
        const enabled = isProviderEnabled("apple.com", config);
        const forced = (import.meta as any)?.env?.VITE_FORCE_APPLE_BUTTON === "true";
        setAppleLikelyEnabled(enabled || forced);
      })
      .catch(() => {
        if (cancelled) return;
        const forced = (import.meta as any)?.env?.VITE_FORCE_APPLE_BUTTON === "true";
        setAppleLikelyEnabled(forced || null);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const response = await fetch("https://identitytoolkit.googleapis.com/v1/?key=dummy", {
          method: "GET",
          mode: "no-cors" as RequestMode,
        });
        console.log("[AuthProbe] identitytoolkit reachable (no-cors):", (response as Response)?.type ?? "ok");
      } catch (error) {
        console.warn("[AuthProbe] identitytoolkit blocked by CSP or network:", error);
      }
    })();
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

  const isIOS = useMemo(() => isIOSWeb(), []);
  const popupRecommendation = isIOS ? "iOS Safari redirect recommended" : "Popup supported";

  const envForceApple = (import.meta as any)?.env?.VITE_FORCE_APPLE_BUTTON ?? "";
  const envDebugPanel = (import.meta as any)?.env?.VITE_DEBUG_PANEL ?? "";
  const envApiBase = (import.meta as any)?.env?.VITE_API_BASE ?? "";

  async function runSpaCheck() {
    try {
      setSpaCheckLoading(true);
      setSpaCheckResult(null);
      const res = await fetch(window.location.pathname, { method: "GET", redirect: "manual" });
      setSpaCheckResult({ ok: res.status !== 404, status: res.status });
    } catch {
      setSpaCheckResult({ ok: false, status: 0 });
    } finally {
      setSpaCheckLoading(false);
    }
  }

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
          {/* Health probe */}
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
              <CardTitle>Health JSON</CardTitle>
              <CardDescription>Raw payload from GET /system/health</CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="overflow-auto rounded-md border bg-muted p-3 text-xs leading-relaxed">
{healthJson || (loading ? "Loading…" : "No data")}
              </pre>
            </CardContent>
          </Card>
          {/* Firebase Auth providers */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle>Firebase Auth Providers</CardTitle>
                <CardDescription>Detect Apple provider and client capability.</CardDescription>
              </div>
              <Badge variant={appleLikelyEnabled ? "default" : appleLikelyEnabled === false ? "secondary" : "outline"}>
                {appleLikelyEnabled === null ? "Unknown" : appleLikelyEnabled ? "Apple likely enabled" : "Apple likely disabled"}
              </Badge>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <div>
                <span className="font-medium">Popup:</span> {popupRecommendation}
              </div>
              <div>
                <span className="font-medium">SDK provider available:</span> {sdkProviderConstructible ? "yes" : "no"}
              </div>
            </CardContent>
          </Card>
          {/* SPA rewrite smoke */}
          <Card>
            <CardHeader>
              <CardTitle>SPA Rewrite Smoke</CardTitle>
              <CardDescription>Ensure client-side routes are served without 404</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-3 text-sm">
                <a className="underline" href="/today?demo=1" target="_blank" rel="noreferrer">Open /today?demo=1</a>
                <a className="underline" href="/coach" target="_blank" rel="noreferrer">Open /coach</a>
              </div>
              <div className="flex items-center gap-3">
                <Button size="sm" onClick={runSpaCheck} disabled={spaCheckLoading}>
                  {spaCheckLoading ? "Running…" : "Run SPA check"}
                </Button>
                {spaCheckResult && (
                  <span className={`text-sm ${spaCheckResult.ok ? "text-emerald-600" : "text-destructive"}`}>
                    {spaCheckResult.ok ? "OK" : "Failed"} (HTTP {spaCheckResult.status || 0})
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
          {/* Env flags */}
          <Card>
            <CardHeader>
              <CardTitle>Env Flags</CardTitle>
              <CardDescription>Selected Vite flags (no secrets)</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="text-sm text-muted-foreground grid gap-1">
                <li><span className="font-medium">VITE_FORCE_APPLE_BUTTON:</span> {String(envForceApple)}</li>
                <li><span className="font-medium">VITE_DEBUG_PANEL:</span> {String(envDebugPanel)}</li>
                <li><span className="font-medium">VITE_API_BASE:</span> {envApiBase ? envApiBase : ""}</li>
              </ul>
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
