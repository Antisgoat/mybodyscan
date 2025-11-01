import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { OAuthProvider } from "firebase/auth";
import { isIOSWeb } from "@/lib/isIOSWeb";
import { loadFirebaseAuthClientConfig, isProviderEnabled } from "@/lib/firebaseAuthConfig";

type ProviderStatus = {
  google: boolean;
  apple: boolean;
  email: boolean;
};

type HealthResponse = {
  stripeSecretPresent: boolean;
  openaiKeyPresent: boolean;
  identityToolkitReachable: boolean;
  identityToolkitReason?: string;
  appCheckMode: "disabled" | "soft" | "strict";
  host: string | null;
  timestamp: string;
  authProviders?: ProviderStatus | { unknown: true };
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
        const response = await fetch("/systemHealth", {
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
        const providers = payload.authProviders;
        if (providers && !("unknown" in providers)) {
          setAppleLikelyEnabled(providers.apple);
          setGoogleEnabled(providers.google);
        }
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

    const envAppleEnabled =
      (import.meta as any)?.env?.VITE_SHOW_APPLE === "1" ||
      (import.meta as any)?.env?.VITE_SHOW_APPLE === "true" ||
      (import.meta as any)?.env?.VITE_FORCE_APPLE_BUTTON === "true" ||
      (import.meta as any)?.env?.VITE_SHOW_APPLE_WEB === "true";

    if (status?.authProviders && !("unknown" in status.authProviders)) {
      if (!cancelled) {
        setAppleLikelyEnabled(status.authProviders.apple || envAppleEnabled);
        setGoogleEnabled(status.authProviders.google);
      }
      return () => {
        cancelled = true;
      };
    }

    loadFirebaseAuthClientConfig()
      .then((config) => {
        if (cancelled) return;
        const enabled = isProviderEnabled("apple.com", config);
        setAppleLikelyEnabled(enabled || envAppleEnabled);
        setGoogleEnabled(isProviderEnabled("google.com", config));
      })
      .catch(() => {
        if (cancelled) return;
        setAppleLikelyEnabled(envAppleEnabled || null);
        setGoogleEnabled(null);
      });

    return () => {
      cancelled = true;
    };
  }, [status?.authProviders]);

  const openAiBadge = status
    ? status.openaiKeyPresent
      ? "Configured"
      : "Missing"
    : loading
    ? "Checking…"
    : "Unknown";

  const stripeBadge = status
    ? status.stripeSecretPresent
      ? "Configured"
      : "Disabled"
    : loading
    ? "Checking…"
    : "Unknown";

  const appCheckBadge = status
    ? status.appCheckMode === "disabled"
      ? "Disabled"
      : status.appCheckMode === "soft"
        ? "Soft"
        : "Strict"
    : loading
    ? "Checking…"
    : "Unknown";

  const identityBadge = status
    ? status.identityToolkitReachable
      ? "Reachable"
      : status.identityToolkitReason === "no_client_key"
        ? "API key missing"
        : "Unavailable"
    : loading
    ? "Checking…"
    : "Unknown";

  const isIOS = useMemo(() => isIOSWeb(), []);
  const popupRecommendation = isIOS ? "iOS Safari redirect recommended" : "Popup supported";

  const envForceApple =
    (import.meta as any)?.env?.VITE_SHOW_APPLE ??
    (import.meta as any)?.env?.VITE_FORCE_APPLE_BUTTON ??
    (import.meta as any)?.env?.VITE_SHOW_APPLE_WEB ??
    "";
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
              <Badge variant={status ? (status.openaiKeyPresent ? "default" : "destructive") : "outline"}>
                {openAiBadge}
              </Badge>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {status?.openaiKeyPresent
                  ? "OPENAI_API_KEY detected. Coach replies and scan summaries are allowed."
                  : "OPENAI_API_KEY missing. Coach chat will return a friendly unavailable error."}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle>Stripe</CardTitle>
                <CardDescription>Payments remain optional.</CardDescription>
              </div>
              <Badge variant={status ? (status.stripeSecretPresent ? "default" : "secondary") : "outline"}>
                {stripeBadge}
              </Badge>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {status?.stripeSecretPresent
                  ? "Stripe secret detected. Checkout endpoints are live."
                  : "Missing Stripe secret. Checkout will respond with HTTP 501 (payments_disabled)."}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle>App Check</CardTitle>
                <CardDescription>Enforcement mode for browser clients.</CardDescription>
              </div>
              <Badge
                variant={status
                  ? status.appCheckMode === "strict"
                    ? "secondary"
                    : status.appCheckMode === "soft"
                      ? "default"
                      : "outline"
                  : "outline"}
              >
                {appCheckBadge}
              </Badge>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {status
                  ? status.appCheckMode === "disabled"
                    ? "App Check disabled: tokens are optional in this environment."
                    : status.appCheckMode === "soft"
                      ? "Soft enforcement: requests log warnings but are allowed."
                      : "Strict enforcement: invalid App Check tokens receive HTTP 403."
                  : "Checking…"}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle>Identity Toolkit</CardTitle>
                <CardDescription>Firebase Auth REST availability.</CardDescription>
              </div>
              <Badge variant={status ? (status.identityToolkitReachable ? "default" : "destructive") : "outline"}>
                {identityBadge}
              </Badge>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-1">
              <div>
                {status?.identityToolkitReachable
                  ? "Server-side probe succeeded."
                  : `Probe failed${status?.identityToolkitReason ? ` (${status.identityToolkitReason})` : ""}.`}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Health JSON</CardTitle>
              <CardDescription>Raw payload from GET /systemHealth</CardDescription>
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
                <CardDescription>Console-detected providers and client hints.</CardDescription>
              </div>
              <div className="flex gap-2">
                <Badge variant={appleLikelyEnabled ? "default" : appleLikelyEnabled === false ? "secondary" : "outline"}>
                  {appleLikelyEnabled === null ? "Apple ?" : appleLikelyEnabled ? "Apple on" : "Apple off"}
                </Badge>
                <Badge variant={googleEnabled ? "default" : googleEnabled === false ? "secondary" : "outline"}>
                  {googleEnabled === null ? "Google ?" : googleEnabled ? "Google on" : "Google off"}
                </Badge>
              </div>
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
              <p className="text-sm text-muted-foreground">
                <span className="font-medium">Last check:</span>{" "}
                {status?.timestamp
                  ? new Date(status.timestamp).toLocaleString()
                  : loading
                  ? "Checking…"
                  : "Unknown"}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
