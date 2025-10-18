import { useEffect, useMemo, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuthUser } from "@/lib/auth";
import { useDemoMode } from "@/components/DemoModeProvider";
import { getAppCheckToken, isAppCheckActive } from "@/appCheck";
import { loadFirebaseAuthClientConfig, isProviderEnabled } from "@/lib/firebaseAuthConfig";
import { ALLOWED_HOSTS } from "@/lib/env";
import { getAuthSafe } from "@/lib/firebase";

interface ProviderStatus {
  id: string;
  label: string;
  enabled: boolean;
}

function formatClaims(claims: Record<string, unknown> | null): string {
  if (!claims) return "{}";
  try {
    return JSON.stringify(claims, null, 2);
  } catch {
    return String(claims);
  }
}

export default function DebugOverlay() {
  const location = useLocation();
  const { user } = useAuthUser();
  const demo = useDemoMode();
  const [appCheckTokenPresent, setAppCheckTokenPresent] = useState<boolean | null>(null);
  const [providerStatus, setProviderStatus] = useState<ProviderStatus[]>([]);
  const [claims, setClaims] = useState<Record<string, unknown> | null>(null);
  const [role, setRole] = useState<string | null>(null);

  const debugParam = useMemo(() => new URLSearchParams(location.search).get("debug") === "1", [location.search]);
  const host = typeof window !== "undefined" ? window.location.host : "unknown";
  const hostAllowed = useMemo(() => {
    if (typeof window === "undefined") return false;
    const hostname = window.location.hostname.toLowerCase();
    return ALLOWED_HOSTS.some((candidate) => {
      const normalized = candidate.trim().toLowerCase();
      if (!normalized) return false;
      if (hostname === normalized) return true;
      return hostname.endsWith(`.${normalized}`);
    });
  }, [host]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await getAppCheckToken(false);
        if (!cancelled) {
          setAppCheckTokenPresent(Boolean(token));
        }
      } catch (error) {
        if (!cancelled) {
          setAppCheckTokenPresent(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (typeof window === "undefined") return;
    void loadFirebaseAuthClientConfig()
      .then((config) => {
        if (cancelled) return;
        const statuses: ProviderStatus[] = [
          { id: "password", label: "Email/Password", enabled: true },
          {
            id: "google.com",
            label: "Google",
            enabled: isProviderEnabled("google.com", config),
          },
          {
            id: "apple.com",
            label: "Apple",
            enabled:
              import.meta.env.APPLE_OAUTH_ENABLED === "true" && isProviderEnabled("apple.com", config),
          },
        ];
        setProviderStatus(statuses);
      })
      .catch(() => {
        if (!cancelled) {
          setProviderStatus([
            { id: "password", label: "Email/Password", enabled: true },
            { id: "google.com", label: "Google", enabled: false },
            {
              id: "apple.com",
              label: "Apple",
              enabled: import.meta.env.APPLE_OAUTH_ENABLED === "true",
            },
          ]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const auth = await getAuthSafe().catch(() => null);
      const current = user ?? auth?.currentUser ?? null;
      if (!current) {
        setClaims(null);
        setRole(null);
        return;
      }
      try {
        const token = await current.getIdTokenResult();
        if (cancelled) return;
        setClaims(token.claims as Record<string, unknown>);
        const claimRole = typeof token.claims.role === "string" ? token.claims.role : null;
        setRole(claimRole);
      } catch {
        if (!cancelled) {
          setClaims(null);
          setRole(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const isDevUser = (role === "dev") || (user?.email?.toLowerCase() === "developer@adlrlabs.com");
  const allowOverlay = import.meta.env.DEV || (debugParam && isDevUser);

  if (!allowOverlay) {
    return <Navigate to="/" replace />;
  }

  const appCheckStatus = appCheckTokenPresent == null ? "checking" : appCheckTokenPresent ? "present" : "missing";
  const buildTag = typeof __BUILD_TAG__ === "string" ? __BUILD_TAG__ : "dev";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Auth diagnostics</h1>
            <p className="text-sm text-slate-400">Build {buildTag}</p>
          </div>
          <div className="text-right text-sm text-slate-400">
            <div>Host: {host}</div>
            <div>Allow-listed: {hostAllowed ? "yes" : "no"}</div>
            <div>App Check active: {isAppCheckActive() ? "true" : "false"}</div>
            <div>App Check token: {appCheckStatus}</div>
          </div>
        </header>

        <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
          <h2 className="text-lg font-medium">Providers</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {providerStatus.map((provider) => (
              <li key={provider.id} className="flex items-center justify-between">
                <span>{provider.label}</span>
                <span className={provider.enabled ? "text-emerald-400" : "text-rose-400"}>
                  {provider.enabled ? "enabled" : "disabled"}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
          <h2 className="text-lg font-medium">Environment</h2>
          <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <div className="text-slate-400">Allowed hosts</div>
              <div className="font-mono text-xs text-slate-200 break-words">{ALLOWED_HOSTS.join(", ")}</div>
            </div>
            <div>
              <div className="text-slate-400">Debug param</div>
              <div>{debugParam ? "?debug=1" : "none"}</div>
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
          <h2 className="text-lg font-medium">User</h2>
          <div className="mt-2 text-sm space-y-1">
            <div>UID: {user?.uid ?? "anonymous"}</div>
            <div>Email: {user?.email ?? "n/a"}</div>
            <div>Anonymous: {user?.isAnonymous ? "true" : "false"}</div>
            <div>Demo mode: {demo ? "true" : "false"}</div>
            <div>Role: {role ?? "n/a"}</div>
          </div>
        </section>

        <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
          <h2 className="text-lg font-medium">Claims</h2>
          <pre className="mt-2 max-h-64 overflow-auto rounded bg-slate-950/60 p-3 text-xs text-slate-200">
            {formatClaims(claims)}
          </pre>
        </section>
      </div>
    </div>
  );
}
