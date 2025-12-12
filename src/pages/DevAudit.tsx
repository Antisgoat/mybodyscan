import { useEffect, useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { isIOSWeb } from "@/lib/isIOSWeb";
import {
  loadFirebaseAuthClientConfig,
  isProviderEnabled,
} from "@/lib/firebaseAuthConfig";
import { coachPlanDocPath, coachChatCollectionPath } from "@/lib/paths";
import { appVersion } from "@/lib/appInfo";

function formatDateYYYYMMDD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

export default function DevAudit() {
  const [healthJson, setHealthJson] = useState<string>("");
  const [healthStatus, setHealthStatus] = useState<number | null>(null);
  const [appleEnabled, setAppleEnabled] = useState<boolean | null>(null);
  const [googleEnabled, setGoogleEnabled] = useState<boolean | null>(null);
  const [rewriteProbe, setRewriteProbe] = useState<null | {
    healthOk: boolean;
    healthStatus: number;
    fallbackOk: boolean;
    fallbackStatus: number;
  }>(null);
  const [probing, setProbing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    async function loadHealth() {
      try {
        const res = await fetch("/system/health", {
          method: "GET",
          credentials: "include",
          signal: controller.signal,
        });
        if (cancelled) return;
        setHealthStatus(res.status);
        const json = await res.json().catch(() => null);
        setHealthJson(
          JSON.stringify(json ?? { error: "invalid json" }, null, 2)
        );
      } catch {
        if (!cancelled) {
          setHealthStatus(0);
          setHealthJson("<request failed>");
        }
      }
    }
    void loadHealth();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadFirebaseAuthClientConfig()
      .then((cfg) => {
        if (cancelled) return;
        setAppleEnabled(isProviderEnabled("apple.com", cfg));
        setGoogleEnabled(isProviderEnabled("google.com", cfg));
      })
      .catch(() => {
        if (cancelled) return;
        setAppleEnabled(null);
        setGoogleEnabled(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const isIOS = useMemo(() => isIOSWeb(), []);
  const popupHint = isIOS
    ? "iOS Safari redirect recommended"
    : "Popup supported";

  const routeLinks = useMemo(
    () => [
      { path: "/", label: "Root" },
      { path: "/home", label: "Home" },
      { path: "/today?demo=1", label: "Today (demo)" },
      { path: "/scan", label: "Scan" },
      { path: "/nutrition", label: "Nutrition" },
      { path: "/workouts", label: "Workouts" },
      { path: "/coach", label: "Coach" },
      { path: "/meals", label: "Meals" },
      { path: "/history", label: "History" },
      { path: "/plans", label: "Plans" },
      { path: "/settings", label: "Settings" },
      { path: "/report", label: "Report" },
      { path: "/system/check", label: "System Check" },
      { path: "/debug/health", label: "Debug Health" },
      { path: "/dev/audit", label: "Dev Audit (this)" },
    ],
    []
  );

  async function runRewriteSmoke() {
    try {
      setProbing(true);
      setRewriteProbe(null);
      const [healthRes, fallbackRes] = await Promise.all([
        fetch("/system/health", { method: "GET", redirect: "manual" }),
        fetch("/this/path/does/not/exist", {
          method: "GET",
          redirect: "manual",
        }),
      ]);
      setRewriteProbe({
        healthOk: healthRes.ok,
        healthStatus: healthRes.status,
        fallbackOk: fallbackRes.status !== 404,
        fallbackStatus: fallbackRes.status,
      });
    } catch {
      setRewriteProbe({
        healthOk: false,
        healthStatus: 0,
        fallbackOk: false,
        fallbackStatus: 0,
      });
    } finally {
      setProbing(false);
    }
  }

  const viteEnvPairs = useMemo(() => {
    const raw = (import.meta as any)?.env ?? {};
    return Object.entries(raw)
      .filter(([k]) => k.startsWith("VITE_"))
      .map(([k, v]) => [k, String(v ?? "")] as const)
      .sort((a, b) => a[0].localeCompare(b[0]));
  }, []);

  function downloadSummary() {
    const today = new Date();
    const payload = {
      dateISO: today.toISOString(),
      appVersion,
      iosWeb: isIOS,
      providers: { appleEnabled, googleEnabled },
      rewriteProbe,
      env: Object.fromEntries(viteEnvPairs),
      routes: routeLinks.map((r) => r.path),
      firestorePaths: {
        coachPlanDocPath: coachPlanDocPath("USER_ID"),
        coachChatCollectionPath: coachChatCollectionPath("USER_ID"),
      },
      healthStatus,
      health: healthJson,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dev-audit-${formatDateYYYYMMDD(today)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto w-full max-w-4xl flex flex-col gap-6 px-4 py-10">
        <div>
          <h1 className="text-3xl font-semibold">Developer Audit</h1>
          <p className="text-sm text-muted-foreground">
            Read-only runtime and repo signals
          </p>
        </div>

        <div className="grid gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle>Health</CardTitle>
                <CardDescription>
                  Raw payload from GET /system/health
                </CardDescription>
              </div>
              <Badge
                variant={
                  healthStatus && healthStatus >= 200 && healthStatus < 300
                    ? "default"
                    : healthStatus === null
                      ? "outline"
                      : "destructive"
                }
              >
                {healthStatus === null ? "Checking…" : `HTTP ${healthStatus}`}
              </Badge>
            </CardHeader>
            <CardContent>
              <pre className="overflow-auto rounded-md border bg-muted p-3 text-xs leading-relaxed">
                {healthJson || "Loading…"}
              </pre>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle>Routes</CardTitle>
                <CardDescription>
                  Quick openers for key app routes
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                {routeLinks.map((r) => (
                  <li
                    key={r.path}
                    className="flex items-center justify-between gap-3"
                  >
                    <span className="truncate">
                      <span className="font-medium">{r.label}:</span> {r.path}
                    </span>
                    <a
                      className="underline shrink-0"
                      href={r.path}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open
                    </a>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle>Firebase Providers</CardTitle>
                <CardDescription>
                  Console-detected providers and UA hint
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Badge
                  variant={
                    appleEnabled
                      ? "default"
                      : appleEnabled === false
                        ? "secondary"
                        : "outline"
                  }
                >
                  {appleEnabled === null
                    ? "Apple ?"
                    : appleEnabled
                      ? "Apple on"
                      : "Apple off"}
                </Badge>
                <Badge
                  variant={
                    googleEnabled
                      ? "default"
                      : googleEnabled === false
                        ? "secondary"
                        : "outline"
                  }
                >
                  {googleEnabled === null
                    ? "Google ?"
                    : googleEnabled
                      ? "Google on"
                      : "Google off"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              <div>
                <span className="font-medium">Popup:</span> {popupHint}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Hosting Rewrites Smoke</CardTitle>
              <CardDescription>
                GET /system/health and a nonexistent path (should not 404)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-3">
                <Button size="sm" onClick={runRewriteSmoke} disabled={probing}>
                  {probing ? "Running…" : "Run"}
                </Button>
                {rewriteProbe && (
                  <div className="text-sm">
                    <span
                      className={
                        rewriteProbe.healthOk
                          ? "text-emerald-600"
                          : "text-destructive"
                      }
                    >
                      /system/health: HTTP {rewriteProbe.healthStatus}
                    </span>
                    <span className="mx-2">·</span>
                    <span
                      className={
                        rewriteProbe.fallbackOk
                          ? "text-emerald-600"
                          : "text-destructive"
                      }
                    >
                      /this/path/does/not/exist: HTTP{" "}
                      {rewriteProbe.fallbackStatus}
                    </span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Firestore Paths</CardTitle>
              <CardDescription>
                Path helpers from src/lib/paths.ts
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="text-sm text-muted-foreground grid gap-1">
                <li>
                  <span className="font-medium">
                    coachPlanDocPath(\"USER_ID\"):
                  </span>{" "}
                  {coachPlanDocPath("USER_ID")}
                </li>
                <li>
                  <span className="font-medium">
                    coachChatCollectionPath(\"USER_ID\"):
                  </span>{" "}
                  {coachChatCollectionPath("USER_ID")}
                </li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle>Build Info</CardTitle>
                <CardDescription>VITE_* flags and app version</CardDescription>
              </div>
              <Badge variant="outline">v{appVersion}</Badge>
            </CardHeader>
            <CardContent>
              <ul className="text-sm text-muted-foreground grid gap-1">
                {viteEnvPairs.map(([k, v]) => (
                  <li key={k}>
                    <span className="font-medium">{k}:</span> {v}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button variant="secondary" onClick={downloadSummary}>
              Download summary
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
