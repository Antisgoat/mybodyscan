import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { onAuthStateChanged, type User } from "firebase/auth";

import { auth, firebaseApiKey } from "../lib/firebase";
import { checkIdentityToolkitReachability, type IdentityToolkitStatus } from "@/utils/idtoolkit";
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

type HealthState = "good" | "warn" | "bad" | "unknown";

type StatusRow = {
  key: string;
  label: string;
  state: HealthState;
  description?: string | null;
  remediation?: string | null;
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

  const identityToolkitReason = clientIdentityToolkitStatus?.reason ?? data?.identityToolkitReason ?? null;
  const identityToolkitOk = clientIdentityToolkitStatus?.reachable ?? data?.identityToolkitReachable ?? null;
  const identityToolkitDetail = describeIdentityToolkitReason(identityToolkitReason);
  const identityToolkitRemediation = getIdentityToolkitRemediation(identityToolkitReason);

  const statusRows = useMemo<StatusRow[]>(() => {
    const rows: StatusRow[] = [];

    const stripeState: HealthState = data
      ? data.stripeSecretPresent
        ? "good"
        : "bad"
      : "unknown";
    rows.push({
      key: "stripe",
      label: "Stripe secret",
      state: stripeState,
      description: !data
        ? "Checking…"
        : data.stripeSecretPresent
          ? "Secret configured"
          : "Secret missing",
      remediation: data && !data.stripeSecretPresent
        ? "Add STRIPE_SECRET to Firebase Functions config."
        : null,
    });

    const openAiState: HealthState = data
      ? data.openaiKeyPresent
        ? "good"
        : "bad"
      : "unknown";
    rows.push({
      key: "openai",
      label: "OpenAI key",
      state: openAiState,
      description: !data
        ? "Checking…"
        : data.openaiKeyPresent
          ? "Key configured"
          : "Key missing",
      remediation: data && !data.openaiKeyPresent ? "Set OPENAI_API_KEY secret." : null,
    });

    const identityState: HealthState =
      identityToolkitOk === null ? "unknown" : identityToolkitOk ? "good" : "bad";
    const identityDescription =
      identityToolkitDetail ??
      (!data && identityToolkitOk === null
        ? "Checking…"
        : identityToolkitOk
          ? "Reachable"
          : "Unreachable");
    rows.push({
      key: "identity",
      label: "Identity Toolkit",
      state: identityState,
      description: identityDescription,
      remediation: identityState === "bad" ? identityToolkitRemediation : null,
    });

    const appCheckState: HealthState = !data
      ? "unknown"
      : data.appCheckMode === "strict"
        ? "good"
        : data.appCheckMode === "soft"
          ? "warn"
          : "bad";
    let appCheckDescription: string | null = null;
    let appCheckRemediation: string | null = null;
    if (!data) {
      appCheckDescription = "Checking…";
    } else if (data.appCheckMode === "strict") {
      appCheckDescription = "Strict enforcement";
    } else if (data.appCheckMode === "soft") {
      appCheckDescription = "Soft enforcement";
    } else {
      appCheckDescription = "Disabled";
      appCheckRemediation = "Enable App Check (strict) in Firebase console.";
    }
    rows.push({
      key: "app-check",
      label: "App Check",
      state: appCheckState,
      description: appCheckDescription,
      remediation: appCheckState === "bad" ? appCheckRemediation : null,
    });

    const providers = data?.authProviders;
    const providerFlags = providers && hasProviderFlags(providers) ? providers : null;
    const providerSpecs: Array<{ key: keyof ProviderStatus; label: string }> = [
      { key: "google", label: "Google" },
      { key: "apple", label: "Apple" },
      { key: "email", label: "Email/password" },
    ];

    for (const spec of providerSpecs) {
      if (!data) {
        rows.push({
          key: `provider-${spec.key}`,
          label: `Auth: ${spec.label}`,
          state: "unknown",
          description: "Checking…",
        });
        continue;
      }

      if (!providerFlags) {
        rows.push({
          key: `provider-${spec.key}`,
          label: `Auth: ${spec.label}`,
          state: "unknown",
          description: "Status unknown",
        });
        continue;
      }

      const enabled = providerFlags[spec.key];
      rows.push({
        key: `provider-${spec.key}`,
        label: `Auth: ${spec.label}`,
        state: enabled ? "good" : "bad",
        description: enabled ? "Enabled" : "Disabled",
        remediation: enabled
          ? null
          : `Enable ${spec.label} sign-in in Firebase Authentication settings.`,
      });
    }

    return rows;
  }, [data, identityToolkitDetail, identityToolkitOk, identityToolkitRemediation]);

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
            <StatusMatrix rows={statusRows} />
            <p className="text-xs text-muted-foreground">
              Soft App Check mode logs missing tokens but still serves responses; strict mode returns a 401 when a token is absent or invalid.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatusMatrix({ rows }: { rows: StatusRow[] }) {
  return (
    <div className="divide-y rounded-lg border bg-background">
      {rows.map((row) => (
        <div
          key={row.key}
          className="flex flex-col gap-2 p-4 md:flex-row md:items-center md:justify-between"
        >
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">{row.label}</p>
            {row.description && (
              <p className="text-xs text-muted-foreground">{row.description}</p>
            )}
            {row.state === "bad" && row.remediation && (
              <p className="text-xs font-medium text-destructive">{row.remediation}</p>
            )}
          </div>
          <SeverityPill state={row.state} />
        </div>
      ))}
    </div>
  );
}

const STATUS_STYLES: Record<HealthState, { label: string; className: string; dot: string }> = {
  good: {
    label: "Healthy",
    className: "border-emerald-200 bg-emerald-100 text-emerald-700",
    dot: "bg-emerald-500",
  },
  warn: {
    label: "Degraded",
    className: "border-amber-200 bg-amber-100 text-amber-700",
    dot: "bg-amber-500",
  },
  bad: {
    label: "Issue",
    className: "border-red-200 bg-red-100 text-red-700",
    dot: "bg-red-500",
  },
  unknown: {
    label: "Unknown",
    className: "border-muted bg-muted text-muted-foreground",
    dot: "bg-muted-foreground",
  },
};

function SeverityPill({ state }: { state: HealthState }) {
  const style = STATUS_STYLES[state];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium",
        style.className,
      )}
    >
      <span className={cn("h-2 w-2 rounded-full", style.dot)} />
      {style.label}
    </span>
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

function describeIdentityToolkitReason(reason?: string | null): string | null {
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

function getIdentityToolkitRemediation(reason?: string | null): string | null {
  if (!reason) {
    return "Verify Identity Toolkit configuration in the Firebase project.";
  }

  switch (reason) {
    case "no_project_id":
      return "Set GCLOUD_PROJECT or FIREBASE_CONFIG.projectId for Cloud Functions.";
    case "no_client_key":
    case "missing_api_key":
      return "Provide the Firebase web API key (clientKey) used for Identity Toolkit calls.";
    case "timeout":
      return "Check connectivity to identitytoolkit.googleapis.com from the Cloud Functions environment.";
    case "network_error":
      return "Allow outbound HTTPS traffic to identitytoolkit.googleapis.com.";
    default:
      if (reason.startsWith("status_")) {
        return "Verify the Identity Toolkit API is enabled and the API key has access.";
      }
      return "Verify Identity Toolkit credentials and service status.";
  }
}
