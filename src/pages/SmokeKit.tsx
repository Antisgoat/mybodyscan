import { useEffect, useMemo, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { deleteDoc, doc, getDoc, setDoc } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { auth, functions, db, firebaseReady } from "@/lib/firebase";
import { useClaims } from "@/lib/claims";
import { ensureAppCheck, getAppCheckHeader, hasAppCheck } from "@/lib/appCheck";
import { PRICE_IDS } from "@/lib/payments";
import { BUILD } from "@/lib/buildInfo";
import { STRIPE_PUBLISHABLE_KEY } from "@/lib/flags";
import { Seo } from "@/components/Seo";
import { cn } from "@/lib/utils";
import { requestAccountDeletion, requestExportIndex } from "@/lib/account";

const PRICE_LABELS: Record<string, string> = {
  [PRICE_IDS.ONE_TIME_STARTER]: "ONE_TIME_STARTER",
  [PRICE_IDS.EXTRA_ONE_TIME]: "EXTRA_ONE_TIME",
  [PRICE_IDS.PRO_MONTHLY]: "PRO_MONTHLY",
  [PRICE_IDS.ELITE_ANNUAL]: "ELITE_ANNUAL",
};

type ProbeStatus = "idle" | "running" | "success" | "error";

type HttpProbeResult = {
  status: ProbeStatus;
  httpStatus?: number;
  payload?: unknown;
  error?: string;
  code?: string;
  url?: string;
};

type AppCheckState = {
  status: ProbeStatus;
  hasToken: boolean;
  suffix?: string;
  error?: string;
};

type ClaimsState = {
  status: ProbeStatus;
  message?: string;
  unlimited?: boolean;
  updated?: boolean;
  error?: string;
};

type NutritionProbe = HttpProbeResult & {
  count?: number;
  source?: string;
};

type BarcodeProbe = HttpProbeResult & {
  source?: string;
};

type ScanProbe = HttpProbeResult & {
  scanId?: string;
};

type CoachProbe = HttpProbeResult & {
  replySnippet?: string;
  usedLLM?: boolean;
};

type CacheState = {
  status: ProbeStatus;
  message?: string;
};

type RulesProbeState = {
  status: ProbeStatus;
  read?: "ok" | "denied";
  write?: "blocked" | "allowed";
  error?: string;
};

type ExportProbeState = {
  status: ProbeStatus;
  count?: number;
  firstId?: string;
  expiresAt?: string;
  error?: string;
};

async function authedHeaders(includeJson = true): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) throw new Error("auth_required");
  const headers: Record<string, string> = {};
  if (includeJson) headers["Content-Type"] = "application/json";
  headers.Authorization = `Bearer ${await user.getIdToken()}`;
  return headers;
}

async function appCheckHeaders(force = false): Promise<Record<string, string>> {
  if (!hasAppCheck()) return {};
  await ensureAppCheck();
  const header = await getAppCheckHeader(force);
  return header;
}

function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch (error) {
    return String(value);
  }
}

function describeStatus(probe: HttpProbeResult | NutritionProbe | BarcodeProbe | ScanProbe | CoachProbe) {
  const base = probe.status === "idle" ? "Idle" : probe.status === "running" ? "Running" : probe.status === "success" ? "OK" : "Error";
  if (probe.httpStatus) {
    return `${base} • HTTP ${probe.httpStatus}`;
  }
  return base;
}

function PublishableBadge() {
  const pk = STRIPE_PUBLISHABLE_KEY || "";
  const label = pk.startsWith("pk_live") ? "LIVE" : pk.startsWith("pk_test") ? "TEST" : pk ? "CUSTOM" : "MISSING";
  const tone = label === "LIVE" ? "bg-red-500/10 text-red-500" : label === "TEST" ? "bg-emerald-500/10 text-emerald-500" : "bg-muted text-muted-foreground";
  return (
    <Badge className={cn("uppercase tracking-wide", tone)}>{label}</Badge>
  );
}

function BuildSummary() {
  const builtAt = BUILD.builtAt ? new Date(BUILD.builtAt) : null;
  const commit = BUILD.commit ? BUILD.commit.slice(0, 7) : "unknown";
  return (
    <div className="text-sm text-muted-foreground space-y-1">
      <div className="flex items-center gap-2">
        <span>Stripe key:</span>
        <PublishableBadge />
        <code className="px-2 py-0.5 bg-muted rounded text-xs">{STRIPE_PUBLISHABLE_KEY ? `${STRIPE_PUBLISHABLE_KEY.slice(0, 6)}…` : "not set"}</code>
      </div>
      <div>Origin: <code>{typeof window !== "undefined" ? window.location.origin : ""}</code></div>
      <div>
        Build: <code>{commit}</code>
        {BUILD.branch ? ` on ${BUILD.branch}` : ""}
        {builtAt ? ` • ${builtAt.toLocaleString()}` : ""}
      </div>
    </div>
  );
}

export default function SmokeKit() {
  const { user, claims, loading: claimsLoading, refresh: refreshClaimsHook } = useClaims();
  const [claimsState, setClaimsState] = useState<ClaimsState>({ status: "idle" });
  const [appCheckState, setAppCheckState] = useState<AppCheckState>({ status: "idle", hasToken: false });
  const [checkoutProbes, setCheckoutProbes] = useState<Record<string, HttpProbeResult>>({});
  const [portalProbe, setPortalProbe] = useState<HttpProbeResult>({ status: "idle" });
  const [scanStart, setScanStart] = useState<ScanProbe>({ status: "idle" });
  const [scanSubmit, setScanSubmit] = useState<HttpProbeResult>({ status: "idle" });
  const [coachProbe, setCoachProbe] = useState<CoachProbe>({ status: "idle" });
  const [nutritionSearchProbe, setNutritionSearchProbe] = useState<NutritionProbe>({ status: "idle" });
  const [barcodeProbe, setBarcodeProbe] = useState<BarcodeProbe>({ status: "idle" });
  const [cacheState, setCacheState] = useState<CacheState>({ status: "idle" });
  const [rulesProbe, setRulesProbe] = useState<RulesProbeState>({ status: "idle" });
  const [exportProbe, setExportProbe] = useState<ExportProbeState>({ status: "idle" });
  const [deleteProbe, setDeleteProbe] = useState<ProbeStatus>("idle");
  const [deleteText, setDeleteText] = useState("");

  const allowAccess = useMemo(() => {
    if (import.meta.env.DEV) return true;
    if (!claims) return false;
    return Boolean(claims?.staff === true || claims?.dev === true || claims?.unlimitedCredits === true);
  }, [claims]);

  const allowFinalDelete = useMemo(() => {
    if (import.meta.env.DEV) return true;
    if (!claims) return false;
    return Boolean(claims?.staff === true || claims?.dev === true);
  }, [claims]);

  const deleteReady = allowFinalDelete && deleteText.trim().toUpperCase() === "DELETE";

  const readableClaims = useMemo(() => {
    if (!claims) return "{}";
    const clone = { ...claims } as Record<string, unknown>;
    if (clone.exp) delete clone.exp;
    if (clone.auth_time) delete clone.auth_time;
    return formatJson(clone);
  }, [claims]);

  const checkoutPrices = useMemo(() => Object.values(PRICE_IDS), []);

  useEffect(() => {
    // Ensure App Check boots lazily for live probes
    if (!hasAppCheck()) return;
    void ensureAppCheck();
  }, []);

  async function handleRefreshClaims() {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      setClaimsState({ status: "error", error: "auth_required" });
      return;
    }
    setClaimsState({ status: "running" });
    try {
      const callable = httpsCallable(functions, "refreshClaims");
      const response = await callable({});
      const data = (response?.data || {}) as { updated?: boolean; unlimitedCredits?: boolean };
      await currentUser.getIdToken(true);
      const refreshed = await refreshClaimsHook();
      setClaimsState({
        status: "success",
        message: data.updated ? "Claims updated" : "Claims already up to date",
        unlimited: data.unlimitedCredits ?? (refreshed?.unlimitedCredits === true),
        updated: data.updated,
      });
    } catch (error: any) {
      setClaimsState({ status: "error", error: error?.code || error?.message || "claim_error" });
    }
  }

  async function handleAppCheckProbe() {
    setAppCheckState({ status: "running", hasToken: false });
    try {
      const headers = await appCheckHeaders(true);
      const token = headers["X-Firebase-AppCheck"];
      if (token) {
        setAppCheckState({ status: "success", hasToken: true, suffix: token.slice(-6) });
      } else {
        setAppCheckState({ status: "error", hasToken: false, error: "token_missing" });
      }
    } catch (error: any) {
      setAppCheckState({ status: "error", hasToken: false, error: error?.message || "appcheck_error" });
    }
  }

  async function probeRules() {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      setRulesProbe({ status: "error", error: "auth_required" });
      return;
    }
    setRulesProbe({ status: "running" });
    try {
      await firebaseReady();
      const privateDoc = doc(db, `users/${currentUser.uid}/private/__rules_probe`);
      let readError: string | undefined;
      try {
        await getDoc(privateDoc);
      } catch (error: any) {
        readError = error?.code || error?.message || "read_failed";
      }

      let writeBlocked = false;
      let writeError: string | undefined;
      try {
        await setDoc(privateDoc, { touchedAt: Date.now() });
        await deleteDoc(privateDoc).catch(() => undefined);
      } catch (error: any) {
        writeBlocked = true;
        writeError = error?.code || error?.message || "write_denied";
      }

      if (!writeBlocked) {
        setRulesProbe({ status: "error", read: readError ? "denied" : "ok", write: "allowed", error: "write_not_blocked" });
        return;
      }

      if (readError) {
        setRulesProbe({ status: "error", read: "denied", write: "blocked", error: readError });
        return;
      }

      setRulesProbe({ status: "success", read: "ok", write: "blocked", error: writeError });
    } catch (error: any) {
      setRulesProbe({ status: "error", error: error?.code || error?.message || "rules_probe_failed" });
    }
  }

  async function probeExportData() {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      setExportProbe({ status: "error", error: "auth_required" });
      return;
    }
    setExportProbe({ status: "running" });
    try {
      const payload = await requestExportIndex();
      setExportProbe({
        status: "success",
        count: payload.scans.length,
        firstId: payload.scans[0]?.id,
        expiresAt: payload.expiresAt,
      });
    } catch (error: any) {
      setExportProbe({ status: "error", error: error?.code || error?.message || "export_failed" });
    }
  }

  async function probeDeleteAccount() {
    if (!deleteReady) return;
    setDeleteProbe("running");
    try {
      await requestAccountDeletion();
      setDeleteProbe("success");
      setDeleteText("");
    } catch (error: any) {
      setDeleteProbe("error");
    }
  }

  async function probeCheckout(priceId: string) {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      setCheckoutProbes((prev) => ({ ...prev, [priceId]: { status: "error", error: "auth_required" } }));
      return;
    }
    setCheckoutProbes((prev) => ({ ...prev, [priceId]: { status: "running" } }));
    try {
      const headers = await authedHeaders();
      const response = await fetch("/createCheckout", {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify({ priceId }),
      });
      const json = await response.json().catch(() => ({}));
      const result: HttpProbeResult = {
        status: response.ok ? "success" : "error",
        httpStatus: response.status,
        payload: json,
        error: typeof json?.error === "string" ? json.error : undefined,
        code: typeof json?.code === "string" ? json.code : undefined,
        url: typeof json?.url === "string" ? json.url : undefined,
      };
      setCheckoutProbes((prev) => ({ ...prev, [priceId]: result }));
    } catch (error: any) {
      setCheckoutProbes((prev) => ({ ...prev, [priceId]: { status: "error", error: error?.message || "checkout_failed" } }));
    }
  }

  async function probePortal() {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      setPortalProbe({ status: "error", error: "auth_required" });
      return;
    }
    setPortalProbe({ status: "running" });
    try {
      const headers = await authedHeaders();
      const response = await fetch("/createCustomerPortal", {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify({}),
      });
      const json = await response.json().catch(() => ({}));
      setPortalProbe({
        status: response.ok ? "success" : "error",
        httpStatus: response.status,
        payload: json,
        error: typeof json?.error === "string" ? json.error : undefined,
        code: typeof json?.code === "string" ? json.code : undefined,
        url: typeof json?.url === "string" ? json.url : undefined,
      });
    } catch (error: any) {
      setPortalProbe({ status: "error", error: error?.message || "portal_failed" });
    }
  }

  async function probeScanStart() {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      setScanStart({ status: "error", error: "auth_required" });
      return;
    }
    setScanStart({ status: "running" });
    try {
      const headers = await authedHeaders();
      const appCheck = await appCheckHeaders(true);
      const merged = { ...headers, ...appCheck };
      const response = await fetch("/api/scan/start", {
        method: "POST",
        headers: merged,
        credentials: "include",
        body: JSON.stringify({ smoke: true }),
      });
      const json = await response.json().catch(() => ({}));
      const scanId = typeof json?.scanId === "string" ? json.scanId : undefined;
      setScanStart({
        status: response.ok ? "success" : "error",
        httpStatus: response.status,
        payload: json,
        error: typeof json?.error === "string" ? json.error : undefined,
        code: typeof json?.code === "string" ? json.code : undefined,
        scanId,
      });
      if (!response.ok) {
        setScanSubmit({ status: "idle" });
      }
    } catch (error: any) {
      setScanStart({ status: "error", error: error?.message || "scan_start_failed" });
      setScanSubmit({ status: "idle" });
    }
  }

  async function probeScanSubmit() {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      setScanSubmit({ status: "error", error: "auth_required" });
      return;
    }
    if (!scanStart.scanId) {
      setScanSubmit({ status: "error", error: "missing_scan" });
      return;
    }
    setScanSubmit({ status: "running" });
    try {
      const headers = await authedHeaders();
      const appCheck = await appCheckHeaders(true);
      const merged = { ...headers, ...appCheck };
      const response = await fetch("/api/scan/submit", {
        method: "POST",
        headers: merged,
        credentials: "include",
        body: JSON.stringify({ scanId: scanStart.scanId, idempotencyKey: `smoke-${Date.now()}` }),
      });
      const json = await response.json().catch(() => ({}));
      setScanSubmit({
        status: response.ok ? "success" : "error",
        httpStatus: response.status,
        payload: json,
        error: typeof json?.error === "string" ? json.error : undefined,
        code: typeof json?.code === "string" ? json.code : undefined,
      });
    } catch (error: any) {
      setScanSubmit({ status: "error", error: error?.message || "scan_submit_failed" });
    }
  }

  async function probeCoach() {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      setCoachProbe({ status: "error", error: "auth_required" });
      return;
    }
    setCoachProbe({ status: "running" });
    try {
      const headers = await authedHeaders();
      const appCheck = await appCheckHeaders(true);
      const merged = { ...headers, ...appCheck };
      const response = await fetch("/api/coach/chat", {
        method: "POST",
        headers: merged,
        credentials: "include",
        body: JSON.stringify({ message: "ping from smoke", text: "ping from smoke" }),
      });
      const json = await response.json().catch(() => ({}));
      const reply = typeof json?.reply === "string" ? json.reply : undefined;
      setCoachProbe({
        status: response.ok ? "success" : "error",
        httpStatus: response.status,
        payload: json,
        error: typeof json?.error === "string" ? json.error : undefined,
        code: typeof json?.code === "string" ? json.code : undefined,
        replySnippet: reply ? reply.slice(0, 120) : undefined,
        usedLLM: typeof json?.usedLLM === "boolean" ? json.usedLLM : undefined,
      });
    } catch (error: any) {
      setCoachProbe({ status: "error", error: error?.message || "coach_failed" });
    }
  }

  async function probeNutritionSearch() {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      setNutritionSearchProbe({ status: "error", error: "auth_required" });
      return;
    }
    setNutritionSearchProbe({ status: "running" });
    try {
      const headers = await authedHeaders(false);
      const appCheck = await appCheckHeaders(true);
      const merged = { Accept: "application/json", ...headers, ...appCheck };
      const response = await fetch(`/api/nutrition/search?q=${encodeURIComponent("chicken breast")}`, {
        method: "GET",
        headers: merged,
        credentials: "include",
      });
      const json = await response.json().catch(() => ({}));
      const items = Array.isArray(json?.items) ? json.items : [];
      setNutritionSearchProbe({
        status: response.ok ? "success" : "error",
        httpStatus: response.status,
        payload: json,
        error: typeof json?.error === "string" ? json.error : undefined,
        count: items.length,
        source: typeof json?.primarySource === "string" ? json.primarySource : undefined,
      });
    } catch (error: any) {
      setNutritionSearchProbe({ status: "error", error: error?.message || "nutrition_search_failed" });
    }
  }

  async function probeBarcode() {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      setBarcodeProbe({ status: "error", error: "auth_required" });
      return;
    }
    setBarcodeProbe({ status: "running" });
    try {
      const headers = await authedHeaders(false);
      const appCheck = await appCheckHeaders(true);
      const merged = { Accept: "application/json", ...headers, ...appCheck };
      const code = "044000030785";
      const response = await fetch(`/api/nutrition/barcode?code=${encodeURIComponent(code)}`, {
        method: "GET",
        headers: merged,
        credentials: "include",
      });
      const json = await response.json().catch(() => ({}));
      setBarcodeProbe({
        status: response.ok ? "success" : "error",
        httpStatus: response.status,
        payload: json,
        error: typeof json?.error === "string" ? json.error : undefined,
        source: typeof json?.source === "string" ? json.source : undefined,
      });
    } catch (error: any) {
      setBarcodeProbe({ status: "error", error: error?.message || "barcode_failed" });
    }
  }

  async function clearCaches() {
    setCacheState({ status: "running", message: "Clearing caches…" });
    try {
      if (typeof navigator !== "undefined" && navigator.serviceWorker) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.allSettled(regs.map((reg) => reg.unregister()));
      }
      if (typeof caches !== "undefined") {
        const names = await caches.keys();
        await Promise.allSettled(names.map((name) => caches.delete(name)));
      }
      try {
        if (typeof localStorage !== "undefined") localStorage.clear();
      } catch (error) {
        void error; // ignore storage clear failures
      }
      try {
        if (typeof sessionStorage !== "undefined") sessionStorage.clear();
      } catch (error) {
        void error; // ignore session storage clear failures
      }
      try {
        if (typeof indexedDB !== "undefined" && typeof (indexedDB as any).databases === "function") {
          const dbs = await (indexedDB as any).databases();
          await Promise.allSettled(
            dbs
              .map((db: { name?: string } | undefined) => db?.name)
              .filter(Boolean)
              .map((name) =>
                new Promise<void>((resolve) => {
                  const request = indexedDB.deleteDatabase(name!);
                  request.onsuccess = () => resolve();
                  request.onerror = () => resolve();
                  request.onblocked = () => resolve();
                }),
              ),
          );
        }
      } catch (error) {
        void error; // ignore IndexedDB clear failures
      }
      setCacheState({ status: "success", message: "Reloading…" });
    } catch (error: any) {
      setCacheState({ status: "error", message: error?.message || "cache_clear_failed" });
      return;
    }
    setTimeout(() => {
      if (typeof window !== "undefined") {
        window.location.replace("/");
      }
    }, 300);
  }

  if (claimsLoading && !claims) {
    return (
      <div className="p-6">
        <Seo title="Smoke Kit" />
        <p className="text-sm text-muted-foreground">Loading access…</p>
      </div>
    );
  }

  if (!allowAccess) {
    return (
      <div className="p-6 space-y-4">
        <Seo title="Smoke Kit" />
        <Card>
          <CardHeader>
            <CardTitle>Access restricted</CardTitle>
            <CardDescription>This page is limited to staff or unlimited credit accounts.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Sign in with an authorized account or run the app in development mode to view the smoke toolkit.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Seo title="Smoke Kit" />
      <main className="max-w-5xl mx-auto p-6 space-y-6">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold">Smoke Kit</h1>
          <p className="text-sm text-muted-foreground">
            Browser-first verification for auth, payments, App Check, scans, coach, and nutrition.
          </p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>Environment</CardTitle>
            <CardDescription>Deployment details and Stripe publishable key.</CardDescription>
          </CardHeader>
          <CardContent>
            <BuildSummary />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Data lifecycle</CardTitle>
            <CardDescription>Security rules, export callable, and delete callable.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="border rounded-lg p-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">Rules probe</p>
                  <p className="text-xs text-muted-foreground">Read private doc, block write</p>
                </div>
                <Button size="sm" variant="outline" onClick={probeRules} disabled={rulesProbe.status === "running"}>
                  {rulesProbe.status === "running" ? "Probing…" : "Probe rules"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Status: {rulesProbe.status === "idle" ? "Idle" : rulesProbe.status === "running" ? "Running" : rulesProbe.status === "success" ? "Read ok, write blocked" : rulesProbe.error || "Error"}
              </p>
              {rulesProbe.status !== "idle" && rulesProbe.status !== "running" && (
                <p className="text-xs text-muted-foreground">
                  Read: {rulesProbe.read || "unknown"} • Write: {rulesProbe.write || "unknown"}
                </p>
              )}
            </div>

            <div className="border rounded-lg p-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">Export probe</p>
                  <p className="text-xs text-muted-foreground">Callable JSON + signed URLs</p>
                </div>
                <Button size="sm" variant="outline" onClick={probeExportData} disabled={exportProbe.status === "running"}>
                  {exportProbe.status === "running" ? "Preparing…" : "Export preview"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Status: {exportProbe.status === "idle" ? "Idle" : exportProbe.status === "running" ? "Running" : exportProbe.status === "success" ? `OK (${exportProbe.count ?? 0} scans)` : exportProbe.error || "Error"}
              </p>
              {exportProbe.firstId && (
                <p className="text-xs">First scan id: {exportProbe.firstId}</p>
              )}
              {exportProbe.expiresAt && (
                <p className="text-xs text-muted-foreground">Links expire {new Date(exportProbe.expiresAt).toLocaleTimeString()}</p>
              )}
            </div>

            <div className="border rounded-lg p-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-destructive">Final delete (callable)</p>
                  <p className="text-xs text-muted-foreground">Requires typing DELETE (dev/staff only)</p>
                </div>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={probeDeleteAccount}
                  disabled={!deleteReady || deleteProbe === "running"}
                >
                  {deleteProbe === "running" ? "Deleting…" : "Delete account"}
                </Button>
              </div>
              {!allowFinalDelete && (
                <p className="text-xs text-muted-foreground">
                  Enable in development or with staff claims to allow final delete.
                </p>
              )}
              <Input
                value={deleteText}
                onChange={(event) => {
                  setDeleteText(event.target.value);
                  if (deleteProbe !== "running") {
                    setDeleteProbe("idle");
                  }
                }}
                placeholder="Type DELETE to enable"
                className="max-w-xs"
                disabled={!allowFinalDelete}
              />
              <p className="text-xs text-muted-foreground">
                Status: {deleteProbe === "idle" ? "Idle" : deleteProbe === "success" ? "Deleted" : deleteProbe === "running" ? "Running" : "Error"}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-4">
              <CardTitle>Auth &amp; Claims</CardTitle>
              <Button size="sm" onClick={handleRefreshClaims} disabled={claimsState.status === "running"}>
                {claimsState.status === "running" ? "Refreshing…" : "Refresh Claims"}
              </Button>
            </div>
            <CardDescription>Signed in as {user?.email || "unknown"} ({user?.uid || "no uid"}).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm">Status: {claimsState.status === "idle" ? "Idle" : claimsState.status === "running" ? "Refreshing" : claimsState.status === "success" ? claimsState.message || "OK" : claimsState.error || "Error"}</p>
            {typeof claimsState.unlimited === "boolean" && (
              <p className="text-sm">unlimitedCredits: <strong>{claimsState.unlimited ? "true" : "false"}</strong></p>
            )}
            <div>
              <p className="text-xs uppercase text-muted-foreground mb-1">Claims</p>
              <ScrollArea className="h-40 rounded border bg-muted/30 p-2">
                <pre className="text-xs whitespace-pre-wrap break-all leading-5">{readableClaims}</pre>
              </ScrollArea>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-4">
              <CardTitle>App Check</CardTitle>
              <Button size="sm" onClick={handleAppCheckProbe} disabled={appCheckState.status === "running"}>
                {appCheckState.status === "running" ? "Requesting…" : "Fetch Token"}
              </Button>
            </div>
            <CardDescription>Ensures App Check token is issued in this browser.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm">
              Status: {appCheckState.status === "idle" ? "Idle" : appCheckState.status === "running" ? "Requesting" : appCheckState.status === "success" ? "Token active" : appCheckState.error || "Error"}
            </p>
            {appCheckState.hasToken && (
              <p className="text-sm">Token suffix: <code>…{appCheckState.suffix}</code></p>
            )}
            {!hasAppCheck() && (
              <p className="text-sm text-muted-foreground">App Check is disabled in this environment.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Payments</CardTitle>
            <CardDescription>Checkout sessions and customer portal.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {checkoutPrices.map((priceId) => {
                const result = checkoutProbes[priceId] || { status: "idle" };
                return (
                  <div key={priceId} className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">{PRICE_LABELS[priceId] || priceId}</p>
                        <p className="text-xs text-muted-foreground">{priceId}</p>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => probeCheckout(priceId)} disabled={result.status === "running"}>
                        {result.status === "running" ? "Probing…" : "Probe Checkout"}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">{describeStatus(result)}</p>
                    {result.url && (
                      <p className="text-xs">URL: <a href={result.url} className="text-primary underline" target="_blank" rel="noreferrer">Go</a></p>
                    )}
                    {result.error && (
                      <p className="text-xs text-destructive">Error: {result.error}{result.code ? ` (${result.code})` : ""}</p>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="border rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">Customer Portal</p>
                  <p className="text-xs text-muted-foreground">Stripe billing portal access</p>
                </div>
                <Button size="sm" variant="outline" onClick={probePortal} disabled={portalProbe.status === "running"}>
                  {portalProbe.status === "running" ? "Probing…" : "Probe Portal"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">{describeStatus(portalProbe)}</p>
              {portalProbe.url && (
                <p className="text-xs">URL: <a href={portalProbe.url} className="text-primary underline" target="_blank" rel="noreferrer">Go</a></p>
              )}
              {portalProbe.error && (
                <p className="text-xs text-destructive">Error: {portalProbe.error}{portalProbe.code ? ` (${portalProbe.code})` : ""}</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Scan API</CardTitle>
            <CardDescription>Start session and optional dry submit.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={probeScanStart} disabled={scanStart.status === "running"}>
                {scanStart.status === "running" ? "Starting…" : "Probe Scan Start"}
              </Button>
              <Button size="sm" variant="outline" onClick={probeScanSubmit} disabled={!scanStart.scanId || scanSubmit.status === "running"}>
                {scanSubmit.status === "running" ? "Submitting…" : "Fake Submit"}
              </Button>
              {scanStart.scanId && <Badge variant="secondary">scanId: {scanStart.scanId.slice(0, 8)}…</Badge>}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="border rounded-lg p-3 space-y-2">
                <p className="text-sm font-medium">Start</p>
                <p className="text-xs text-muted-foreground">{describeStatus(scanStart)}</p>
                {scanStart.error && (
                  <p className="text-xs text-destructive">Error: {scanStart.error}{scanStart.code ? ` (${scanStart.code})` : ""}</p>
                )}
              </div>
              <div className="border rounded-lg p-3 space-y-2">
                <p className="text-sm font-medium">Submit</p>
                <p className="text-xs text-muted-foreground">{describeStatus(scanSubmit)}</p>
                {scanSubmit.error && (
                  <p className="text-xs text-destructive">Error: {scanSubmit.error}{scanSubmit.code ? ` (${scanSubmit.code})` : ""}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Coach</CardTitle>
            <CardDescription>Ping the coach endpoint and show reply.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button size="sm" onClick={probeCoach} disabled={coachProbe.status === "running"}>
              {coachProbe.status === "running" ? "Requesting…" : "Probe Coach"}
            </Button>
            <p className="text-sm">{describeStatus(coachProbe)}</p>
            {coachProbe.replySnippet && (
              <p className="text-sm text-muted-foreground">
                Reply preview: “{coachProbe.replySnippet}” {typeof coachProbe.usedLLM === "boolean" ? `(usedLLM=${String(coachProbe.usedLLM)})` : ""}
              </p>
            )}
            {coachProbe.error && (
              <p className="text-sm text-destructive">Error: {coachProbe.error}{coachProbe.code ? ` (${coachProbe.code})` : ""}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Nutrition</CardTitle>
            <CardDescription>Search and barcode lookups.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="border rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">Search “chicken breast”</p>
                    <p className="text-xs text-muted-foreground">Ensures USDA/OPENFF reachable</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={probeNutritionSearch} disabled={nutritionSearchProbe.status === "running"}>
                    {nutritionSearchProbe.status === "running" ? "Searching…" : "Probe"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">{describeStatus(nutritionSearchProbe)}</p>
                {typeof nutritionSearchProbe.count === "number" && (
                  <p className="text-xs">Items: {nutritionSearchProbe.count}{nutritionSearchProbe.source ? ` • Source: ${nutritionSearchProbe.source}` : ""}</p>
                )}
                {nutritionSearchProbe.error && (
                  <p className="text-xs text-destructive">Error: {nutritionSearchProbe.error}</p>
                )}
              </div>
              <div className="border rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">Barcode 044000030785</p>
                    <p className="text-xs text-muted-foreground">Oreo cookies (OFF → USDA fallback)</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={probeBarcode} disabled={barcodeProbe.status === "running"}>
                    {barcodeProbe.status === "running" ? "Querying…" : "Probe"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">{describeStatus(barcodeProbe)}</p>
                {barcodeProbe.source && (
                  <p className="text-xs">Source: {barcodeProbe.source}</p>
                )}
                {barcodeProbe.error && (
                  <p className="text-xs text-destructive">Error: {barcodeProbe.error}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cache Tools</CardTitle>
            <CardDescription>Reset caches and reload to clear persistent state.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button variant="destructive" onClick={clearCaches} disabled={cacheState.status === "running"}>
              {cacheState.status === "running" ? "Clearing…" : "Unregister SW + Clear caches"}
            </Button>
            {cacheState.message && <p className="text-sm text-muted-foreground">{cacheState.message}</p>}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
