import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { onAuthStateChanged, type User } from "firebase/auth";

import { auth, firebaseApiKey } from "../lib/firebase";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type SystemHealthResponse = {
  stripeSecretPresent: boolean;
  openaiKeyPresent: boolean;
  identityToolkitReachable: boolean;
  identityToolkitReason?: string;
  authProviders:
    | {
        google: boolean;
        apple: boolean;
        email: boolean;
        unknown?: false;
      }
    | {
        unknown: true;
      };
  appCheck: "disabled" | "soft" | "strict";
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

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (current) => {
      setUser(current);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

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

  const statusItems: StatusItem[] = useMemo(() => {
    if (!data) {
      return [
        { label: "Stripe secret", ok: null },
        { label: "OpenAI key", ok: null },
        { label: "Identity Toolkit", ok: null },
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
        ok: data.identityToolkitReachable,
        detail: describeIdentityToolkitReason(data.identityToolkitReason),
      },
    ];
  }, [data]);

  const identityProviderBadges = useMemo(() => {
    if (!data) {
      return <Badge variant="outline">Loading…</Badge>;
    }
    if (!hasProviderFlags(data.authProviders)) {
      return <Badge variant="outline">Status unknown</Badge>;
    }
    const providers = data.authProviders;
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
    const variant = data.appCheck === "strict" ? "default" : data.appCheck === "soft" ? "secondary" : "outline";
    const label = data.appCheck === "disabled" ? "Disabled" : data.appCheck === "soft" ? "Soft" : "Strict";
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
            </div>
            {error && <p className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">{error}</p>}
            <div className="grid gap-4 md:grid-cols-2">
              {statusItems.map((item) => (
                <StatusCard key={item.label} item={item} />
              ))}
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <CardSection title="Auth providers">{identityProviderBadges}</CardSection>
              <CardSection title="App Check mode">{appCheckBadge}</CardSection>
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

function hasProviderFlags(
  input: SystemHealthResponse["authProviders"],
): input is { google: boolean; apple: boolean; email: boolean } {
  return !("unknown" in input);
}

function describeIdentityToolkitReason(reason?: string): string | null {
  if (!reason) return null;
  switch (reason) {
    case "no_client_key":
      return "Client API key not provided.";
    case "timeout":
      return "Timed out reaching Identity Toolkit.";
    case "network_error":
      return "Network error during Identity Toolkit check.";
    default:
      if (reason.startsWith("status_")) {
        return `Received status ${reason.replace("status_", "")}`;
      }
      return reason;
  }
}
