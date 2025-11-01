import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { onAuthStateChanged, type User } from "firebase/auth";

import { auth, firebaseApiKey } from "../lib/firebase";
import { checkIdentityToolkitReachability, type IdentityToolkitStatus } from "@/utils/idtoolkit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type ProviderStatus = {
  google: boolean;
  apple: boolean;
  email: boolean;
};

type SystemHealthResponse = {
  stripeSecretPresent: boolean;
  openaiKeyPresent: boolean;
  identityToolkitReachable: boolean;
  identityToolkitReason?: string;
  authProviders?: ProviderStatus | { unknown: true };
  appCheckMode: "disabled" | "soft" | "strict";
  host: string | null;
  timestamp: string;
};

type StatusItem = {
  label: string;
  ok: boolean | null;
  detail?: string | null;
};

const allowPublicDiagnostics = import.meta.env.VITE_SHOW_DIAGNOSTICS === "true";

export default function Diagnostics() {
  const [user, setUser] = useState<User | null>(auth.currentUser);
  const [authReady, setAuthReady] = useState(Boolean(auth.currentUser));
  const [data, setData] = useState<SystemHealthResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [clientIdentityToolkitStatus, setClientIdentityToolkitStatus] =
    useState<IdentityToolkitStatus | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (current) => {
      setUser(current);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    void checkIdentityToolkitReachability(firebaseApiKey, { signal: controller.signal })
      .then((result) => {
        if (!cancelled) {
          setClientIdentityToolkitStatus(result);
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err && typeof err === "object" && "name" in err && (err as { name?: string }).name === "AbortError") {
          return;
        }
        const message = err instanceof Error && err.message ? err.message : "network_error";
        setClientIdentityToolkitStatus({ reachable: false, reason: message });
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [firebaseApiKey]);

  const fetchHealth = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (firebaseApiKey) {
        params.set("clientKey", firebaseApiKey);
      }
      const url = `/systemHealth${params.size ? `?${params.toString()}` : ""}`;
      const response = await fetch(url, { credentials: "include" });
      let payload: any = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }
      if (!response.ok) {
        const message = typeof payload?.error === "string" ? payload.error : "request_failed";
        throw new Error(message);
      }
      setData(payload as SystemHealthResponse);
      setLastUpdated(Date.now());
    } catch (err) {
      const message = err instanceof Error ? err.message : "request_failed";
      setError(`Diagnostics unavailable: ${message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (allowPublicDiagnostics || user) {
      void fetchHealth();
    }
  }, [fetchHealth, user]);

  if (!allowPublicDiagnostics && authReady && !user) {
    return <Navigate to="/login" replace />;
  }

  const fingerprint = useMemo(() => {
    const key = firebaseApiKey?.trim();
    if (!key) return "—";
    if (key.length <= 10) return key;
    return `${key.slice(0, 6)}…${key.slice(-4)}`;
  }, []);

  const identityToolkitOk = clientIdentityToolkitStatus?.reachable ?? data?.identityToolkitReachable ?? null;
  const identityToolkitDetail = describeIdentityToolkitReason(
    clientIdentityToolkitStatus?.reason ?? data?.identityToolkitReason,
  );

  const statusItems: StatusItem[] = useMemo(() => {
    if (!data) {
      return [
        { label: "Stripe secret", ok: null },
        { label: "OpenAI key", ok: null },
        { label: "Identity Toolkit", ok: identityToolkitOk, detail: identityToolkitDetail },
      ];
    }
    return [
      {
        label: "Stripe secret",
        ok: data.stripeSecretPresent,
        detail: data.stripeSecretPresent ? null : "Secret missing",
      },
      {
        label: "OpenAI key",
        ok: data.openaiKeyPresent,
        detail: data.openaiKeyPresent ? null : "Key missing",
      },
      {
        label: "Identity Toolkit",
        ok: identityToolkitOk ?? data.identityToolkitReachable,
        detail: identityToolkitDetail,
      },
    ];
  }, [data, identityToolkitDetail, identityToolkitOk]);

  const identityProviderBadges = useMemo(() => {
    if (!data) {
      return <Badge variant="outline">Loading…</Badge>;
    }
    const providersData = data.authProviders;
    if (!providersData || !hasProviderFlags(providersData)) {
      return <Badge variant="outline">Status unknown</Badge>;
    }
    const providers = providersData;
    return (
      <div className="flex flex-wrap gap-2">
        <ProviderBadge label="Google" ok={providers.google} />
        <ProviderBadge label="Apple" ok={providers.apple} />
        <ProviderBadge label="Email" ok={providers.email} />
      </div>
    );
  }, [data]);

  const appCheckBadge = useMemo(() => {
    if (!data) return <Badge variant="outline">Loading…</Badge>;
    const variant = data.appCheckMode === "strict" ? "default" : data.appCheckMode === "soft" ? "secondary" : "outline";
    const label = data.appCheckMode === "disabled" ? "Disabled" : data.appCheckMode === "soft" ? "Soft" : "Strict";
    return <Badge variant={variant}>{label}</Badge>;
  }, [data]);

  return (
    <div className="min-h-screen bg-muted/40 py-10 px-4">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <Card>
          <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-2xl font-semibold tracking-tight">System Diagnostics</CardTitle>
              <p className="text-sm text-muted-foreground">
                Current status for billing, AI, and authentication integrations.
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => fetchHealth()} disabled={loading}>
                {loading ? "Refreshing…" : "Refresh"}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <InfoRow label="API key fingerprint" value={fingerprint} />
              <InfoRow
                label="Last updated"
                value={lastUpdated ? new Date(lastUpdated).toLocaleString() : "—"}
              />
              <InfoRow label="System host" value={data?.host || "—"} />
              <InfoRow
                label="Server timestamp"
                value={data?.timestamp ? new Date(data.timestamp).toLocaleString() : "—"}
              />
            </div>
            {error && <p className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">{error}</p>}
            <div className="grid gap-4 md:grid-cols-2">
              {statusItems.map((item) => (
                <StatusCard key={item.label} item={item} />
              ))}
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <CardSection title="Auth providers">{identityProviderBadges}</CardSection>
              <CardSection title="App Check mode">
                <div className="flex items-center gap-2">{appCheckBadge}</div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Soft mode logs missing App Check tokens but continues diagnostics; strict mode returns a 401 error when the token is absent or invalid.
                </p>
              </CardSection>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatusCard({ item }: { item: StatusItem }) {
  return (
    <div className="rounded-lg border bg-background p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">{item.label}</p>
          {item.detail && <p className="text-xs text-muted-foreground">{item.detail}</p>}
        </div>
        <StatusBadge ok={item.ok} />
      </div>
    </div>
  );
}

function CardSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-background p-4 shadow-sm">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function StatusBadge({ ok }: { ok: boolean | null }) {
  if (ok === null) {
    return <Badge variant="outline">Unknown</Badge>;
  }
  return <Badge variant={ok ? "default" : "destructive"}>{ok ? "Healthy" : "Issue"}</Badge>;
}

function ProviderBadge({ label, ok }: { label: string; ok: boolean }) {
  return (
    <Badge variant={ok ? "default" : "destructive"} className={cn("px-3")}>
      {label}
    </Badge>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border bg-background p-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}

function hasProviderFlags(input: SystemHealthResponse["authProviders"]): input is ProviderStatus {
  if (!input || typeof input !== "object") {
    return false;
  }
  return !("unknown" in input);
}

function describeIdentityToolkitReason(reason?: string): string | null {
  if (!reason) return null;
  switch (reason) {
    case "no_project_id":
      return "Project ID missing on server.";
    case "no_client_key":
      return "Client API key not provided.";
    case "timeout":
      return "Timed out reaching Identity Toolkit.";
    case "network_error":
      return "Network error during Identity Toolkit check.";
    case "missing_api_key":
      return "API key missing for Identity Toolkit check.";
    case "aborted":
      return "Identity Toolkit check was cancelled.";
    default:
      if (reason.startsWith("status_")) {
        return `Received status ${reason.replace("status_", "")}`;
      }
      return reason;
  }
}
