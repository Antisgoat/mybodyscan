import { useCallback, useEffect, useMemo, useState } from "react";
import { GoogleAuthProvider } from "firebase/auth";
import { Copy, ExternalLink, RefreshCw, RotateCcw, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { Seo } from "@/components/Seo";
import { cn } from "@/lib/utils";
import { useAuthUser } from "@/lib/auth";
import { useClaims } from "@/lib/claims";
import { auth, firebaseReady, getFirebaseAuth } from "@/lib/firebase";
import { googleSignInWithFirebase } from "@/lib/login";
import { PRICE_IDS } from "@/lib/payments";
import { ensureAppCheck, getAppCheckHeader, hasAppCheck } from "@/lib/appCheck";
import { resolveUatAccess, useProbe, type UatProbeState, type UatLogEntry, toJsonText } from "@/lib/uat";
import { consumeAuthRedirect, rememberAuthRedirect } from "@/lib/auth";
import { peekAuthRedirectOutcome } from "@/lib/authRedirect";

type JsonValue = unknown;

const STATUS_COLORS: Record<UatProbeState["status"], string> = {
  idle: "bg-muted text-muted-foreground",
  running: "bg-amber-500/10 text-amber-500",
  pass: "bg-emerald-500/10 text-emerald-500",
  fail: "bg-red-500/10 text-red-500",
  skip: "bg-muted text-muted-foreground",
};

const DEFAULT_PRICE_ID = PRICE_IDS.ONE_TIME_STARTER;
const DEFAULT_SCAN_UPLOAD_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43, 0x00, 0xff, 0xc0, 0x00, 0x11]);

function StatusBadge({ state }: { state: UatProbeState }) {
  const tone = STATUS_COLORS[state.status] ?? STATUS_COLORS.idle;
  const label = state.status === "pass" ? "PASS" : state.status === "fail" ? "FAIL" : state.status === "running" ? "RUN" : state.status === "skip" ? "SKIP" : "IDLE";
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold", tone)}>{label}</span>;
}

function formatTimestamp(ts?: number): string {
  if (!ts) return "—";
  const date = new Date(ts);
  return `${date.toLocaleTimeString()}${date.getSeconds() % 2 ? "" : ""}`;
}

function formatDuration(ms?: number): string {
  if (typeof ms !== "number" || Number.isNaN(ms)) return "";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function CopyJsonButton({ value, label }: { value?: JsonValue; label: string }) {
  const { toast } = useToast();
  const disabled = value === null || value === undefined;

  const handleCopy = useCallback(async () => {
    if (disabled) return;
    try {
      const text = toJsonText(value);
      await navigator.clipboard.writeText(text);
      toast({ title: "Copied", description: `${label} JSON copied to clipboard.` });
    } catch (error) {
      toast({ title: "Copy failed", description: (error as Error)?.message ?? "Unable to copy.", variant: "destructive" });
    }
  }, [disabled, label, toast, value]);

  if (disabled) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleCopy}>
          <Copy className="h-4 w-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>Copy JSON</TooltipContent>
    </Tooltip>
  );
}

function ResultLine({ state }: { state: UatProbeState }) {
  const hasDetails = Boolean(state.message || state.code || state.httpStatus);
  if (!hasDetails) {
    return <p className="text-sm text-muted-foreground">No result yet.</p>;
  }
  return (
    <div className="space-y-1 text-sm text-muted-foreground">
      {state.message && <p>{state.message}</p>}
      {(state.code || state.httpStatus) && (
        <p className="text-xs uppercase tracking-wide text-muted-foreground/80">
          {state.code ? `code=${state.code}` : ""}
          {state.code && state.httpStatus ? " • " : ""}
          {state.httpStatus ? `status=${state.httpStatus}` : ""}
        </p>
      )}
      {state.durationMs && <p className="text-xs text-muted-foreground/60">Took {formatDuration(state.durationMs)}</p>}
    </div>
  );
}

const Section = ({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) => (
  <Card>
    <CardHeader>
      <CardTitle>{title}</CardTitle>
      {description && <CardDescription>{description}</CardDescription>}
    </CardHeader>
    <CardContent className="space-y-4">{children}</CardContent>
  </Card>
);

type ScanSession = {
  scanId: string;
  uploadUrls: Record<string, string>;
};

const UATPage = () => {
  const { user } = useAuthUser();
  const { claims, loading: claimsLoading, refresh: refreshClaims } = useClaims();
  const [logs, setLogs] = useState<UatLogEntry[]>([]);
  const [scanSession, setScanSession] = useState<ScanSession | null>(null);
  const [authOutcome, setAuthOutcome] = useState(() => peekAuthRedirectOutcome());
  const [pretendCredits, setPretendCredits] = useState<number | null>(null);
  const access = useMemo(() => resolveUatAccess(user, claims), [user, claims]);

  const pushLog = useCallback((entry: UatLogEntry) => {
    console.log("[uat]", entry.label, entry.status, entry.code ?? "", entry.message ?? "");
    setLogs((prev) => [entry, ...prev].slice(0, 5));
  }, []);

  useEffect(() => {
    if (!authOutcome) {
      setAuthOutcome(peekAuthRedirectOutcome());
    }
  }, [authOutcome]);

  const runtimeProbe = useProbe<Record<string, unknown>>("Firebase init.json", pushLog);

  const handleRuntimeConfig = useCallback(async () => {
    await runtimeProbe.run(async () => {
      const response = await fetch(`/__/firebase/init.json?ts=${Date.now()}`, { cache: "no-store" });
      const json = await response.json().catch(() => ({}));
      const projectId = typeof json?.projectId === "string" && json.projectId.length > 0;
      const apiKey = typeof json?.apiKey === "string" && json.apiKey.length > 0;
      const authDomain = typeof json?.authDomain === "string" && json.authDomain.length > 0;
      const ok = response.ok && projectId && apiKey && authDomain;
      return {
        ok,
        status: ok ? "pass" : "fail",
        code: ok ? null : "init_missing_fields",
        message: ok
          ? "init.json resolved project metadata"
          : `Missing fields: ${[
              projectId ? null : "projectId",
              apiKey ? null : "apiKey",
              authDomain ? null : "authDomain",
            ]
              .filter(Boolean)
              .join(", ")}`,
        data: json,
        httpStatus: response.status,
      };
    });
  }, [runtimeProbe]);

  const googleProbe = useProbe("Auth redirect capability", pushLog);

  const handleGoogleProbe = useCallback(async () => {
    await googleProbe.run(async () => {
      await firebaseReady();
      const authInstance = getFirebaseAuth();
      const provider = new GoogleAuthProvider();
      const redirectCapable = typeof window !== "undefined" && typeof window.location !== "undefined";
      const popupCapable = typeof window !== "undefined" && typeof window.open === "function";
      const ok = redirectCapable;
      return {
        ok,
        status: ok ? "pass" : "fail",
        code: ok ? null : "redirect_unsupported",
        message: ok
          ? `Redirect ready • popup=${popupCapable ? "yes" : "no"} • provider=${provider.providerId}`
          : "Firebase Auth redirect API unavailable",
        data: {
          redirectCapable,
          popupCapable,
          providerId: provider.providerId,
        },
      };
    });
  }, [googleProbe]);

  const handleGoogleRedirect = useCallback(async () => {
    const confirmed = window.confirm("This will trigger a Google redirect flow and navigate away. Continue?");
    if (!confirmed) return;
    rememberAuthRedirect("/__uat");
    await firebaseReady();
    await googleSignInWithFirebase();
  }, []);

  const { toast } = useToast();

  const authHeaders = useCallback(async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw Object.assign(new Error("auth_required"), { code: "auth_required" });
    }
    const token = await currentUser.getIdToken();
    return {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    } as Record<string, string>;
  }, []);

  const checkoutProbe = useProbe<Record<string, unknown>>("Checkout dry-run", pushLog);
  const portalProbe = useProbe<Record<string, unknown>>("Portal dry-run", pushLog);

  const handleCheckoutDryRun = useCallback(async () => {
    await checkoutProbe.run(async () => {
      const headers = await authHeaders();
      headers["X-UAT"] = "1";
      const response = await fetch("/createCheckout", {
        method: "POST",
        headers,
        body: JSON.stringify({ priceId: DEFAULT_PRICE_ID }),
        credentials: "include",
      });
      const json = await response.json().catch(() => ({}));
      const ok = response.ok && typeof json?.url === "string";
      return {
        ok,
        status: ok ? "pass" : "fail",
        code: ok ? null : (json?.code as string | null) ?? "checkout_failed",
        message: ok ? "Dry-run URL issued" : json?.error || "Checkout failed",
        data: json,
        httpStatus: response.status,
      };
    });
  }, [authHeaders, checkoutProbe]);

  const handlePortalDryRun = useCallback(async () => {
    await portalProbe.run(async () => {
      const headers = await authHeaders();
      headers["X-UAT"] = "1";
      const response = await fetch("/createCustomerPortal", {
        method: "POST",
        headers,
        body: JSON.stringify({}),
        credentials: "include",
      });
      const json = await response.json().catch(() => ({}));
      const expectedNoCustomer = response.status === 404 && json?.error === "no_customer";
      const ok = response.ok || expectedNoCustomer;
      return {
        ok,
        status: ok ? "pass" : "fail",
        code: json?.code ?? (expectedNoCustomer ? "no_customer" : null),
        message: ok ? (expectedNoCustomer ? "No customer (expected)" : "Portal URL issued") : json?.error || "Portal failed",
        data: json,
        httpStatus: response.status,
      };
    });
  }, [authHeaders, portalProbe]);

  const appCheckTokenProbe = useProbe<{ suffix?: string }>("App Check token", pushLog);

  const handleAppCheckToken = useCallback(async () => {
    await appCheckTokenProbe.run(async () => {
      if (!hasAppCheck()) {
        return { ok: true, status: "skip", message: "App Check disabled in this environment", data: null };
      }
      await ensureAppCheck();
      const header = await getAppCheckHeader(true);
      const token = header["X-Firebase-AppCheck"];
      const ok = Boolean(token);
      return {
        ok,
        status: ok ? "pass" : "fail",
        code: ok ? null : "token_missing",
        message: ok ? "Token issued" : "Token unavailable",
        data: token ? { suffix: token.slice(-8) } : null,
      };
    });
  }, [appCheckTokenProbe]);

  const coachNoAppCheckProbe = useProbe<Record<string, unknown>>("Coach without App Check", pushLog);
  const coachWithAppCheckProbe = useProbe<Record<string, unknown>>("Coach with App Check", pushLog);
  const nutritionSearchProbe = useProbe<Record<string, unknown>>("Nutrition search", pushLog);

  const makeAuthedFetch = useCallback(
    async (input: RequestInfo, init?: RequestInit, options?: { forceAppCheck?: boolean }) => {
      const headers = await authHeaders();
      const config: RequestInit = {
        credentials: "include",
        ...init,
        headers: {
          ...(init?.headers || {}),
          ...headers,
        },
      };
      if (options?.forceAppCheck && hasAppCheck()) {
        await ensureAppCheck();
        const appCheckHeaders = await getAppCheckHeader(true);
        if (appCheckHeaders["X-Firebase-AppCheck"]) {
          (config.headers as Record<string, string>)["X-Firebase-AppCheck"] = appCheckHeaders["X-Firebase-AppCheck"];
        }
      }
      return fetch(input, config);
    },
    [authHeaders],
  );

  const handleCoachNoAppCheck = useCallback(async () => {
    await coachNoAppCheckProbe.run(async () => {
      const response = await makeAuthedFetch("/api/coach/chat", {
        method: "POST",
        body: JSON.stringify({ message: "uat ping", text: "uat ping" }),
      });
      const json = await response.json().catch(() => ({}));
      const ok = response.status === 401 || response.status === 403 || response.status === 412;
      return {
        ok,
        status: ok ? "pass" : "fail",
        code: json?.code ?? null,
        message: ok ? `Rejected as expected (${response.status})` : json?.error || "Unexpected coach response",
        data: json,
        httpStatus: response.status,
      };
    });
  }, [coachNoAppCheckProbe, makeAuthedFetch]);

  const handleCoachWithAppCheck = useCallback(async () => {
    await coachWithAppCheckProbe.run(async () => {
      const response = await makeAuthedFetch(
        "/api/coach/chat",
        {
          method: "POST",
          body: JSON.stringify({ message: "Hello from UAT", text: "Hello from UAT" }),
        },
        { forceAppCheck: true },
      );
      const json = await response.json().catch(() => ({}));
      const ok = response.ok;
      return {
        ok,
        status: ok ? "pass" : "fail",
        code: json?.code ?? null,
        message: ok ? "Coach responded" : json?.error || "Coach failed",
        data: json,
        httpStatus: response.status,
      };
    });
  }, [coachWithAppCheckProbe, makeAuthedFetch]);

  const handleNutritionSearch = useCallback(async () => {
    await nutritionSearchProbe.run(async () => {
      const response = await makeAuthedFetch(
        "/api/nutrition/search?q=chicken",
        {
          method: "GET",
          headers: {
            Accept: "application/json",
          },
        },
        { forceAppCheck: true },
      );
      const json = await response.json().catch(() => ({}));
      const count = Array.isArray(json?.items) ? json.items.length : 0;
      const ok = response.ok && count > 0;
      return {
        ok,
        status: ok ? "pass" : "fail",
        code: json?.code ?? null,
        message: ok ? `Returned ${count} items` : json?.error || "Nutrition search failed",
        data: json,
        httpStatus: response.status,
      };
    });
  }, [makeAuthedFetch, nutritionSearchProbe]);

  const scanStartProbe = useProbe<Record<string, unknown>>("Scan session", pushLog);
  const scanUploadProbe = useProbe<Record<string, unknown>>("Scan upload", pushLog);
  const scanSubmitProbe = useProbe<Record<string, unknown>>("Scan submit", pushLog);
  const scanDuplicateProbe = useProbe<Record<string, unknown>>("Scan duplicate", pushLog);

  const handleScanStart = useCallback(async () => {
    await scanStartProbe.run(async () => {
      const headers = await authHeaders();
      const appCheckHeaders = hasAppCheck() ? await getAppCheckHeader(true) : {};
      const response = await fetch("/api/scan/start", {
        method: "POST",
        headers: {
          ...headers,
          ...appCheckHeaders,
        },
        credentials: "include",
        body: JSON.stringify({ source: "uat" }),
      });
      const json = await response.json().catch(() => ({}));
      const ok = response.ok && typeof json?.scanId === "string" && json.scanId.length > 0;
      if (ok) {
        setScanSession({ scanId: json.scanId, uploadUrls: json.uploadUrls ?? {} });
      }
      return {
        ok,
        status: ok ? "pass" : "fail",
        code: json?.code ?? null,
        message: ok ? "Scan session created" : json?.error || "Scan start failed",
        data: json,
        httpStatus: response.status,
      };
    });
  }, [authHeaders, scanStartProbe]);

  const handleScanUpload = useCallback(async () => {
    await scanUploadProbe.run(async () => {
      if (!scanSession) {
        throw Object.assign(new Error("missing_session"), { code: "missing_session" });
      }
      const frontUrl = scanSession.uploadUrls?.front;
      if (!frontUrl) {
        throw Object.assign(new Error("missing_upload_url"), { code: "missing_upload_url" });
      }
      const response = await fetch(frontUrl, {
        method: "PUT",
        headers: {
          "Content-Type": "image/jpeg",
        },
        body: DEFAULT_SCAN_UPLOAD_BYTES,
      });
      const ok = response.ok;
      return {
        ok,
        status: ok ? "pass" : "fail",
        code: ok ? null : `http_${response.status}`,
        message: ok ? "Uploaded sample front pose" : `Upload failed (${response.status})`,
        data: { status: response.status, headers: Object.fromEntries(response.headers.entries()) },
        httpStatus: response.status,
      };
    });
  }, [scanSession, scanUploadProbe]);

  const handleScanSubmit = useCallback(async () => {
    await scanSubmitProbe.run(async () => {
      if (!scanSession) {
        throw Object.assign(new Error("missing_session"), { code: "missing_session" });
      }
      const headers = await authHeaders();
      const appCheckHeaders = hasAppCheck() ? await getAppCheckHeader(true) : {};
      const idempotencyKey = `uat-${scanSession.scanId}`;
      const response = await fetch("/api/scan/submit", {
        method: "POST",
        headers: {
          ...headers,
          ...appCheckHeaders,
        },
        body: JSON.stringify({ scanId: scanSession.scanId, idempotencyKey, mode: "uat" }),
        credentials: "include",
      });
      const json = await response.json().catch(() => ({}));
      const ok = response.ok || json?.code === "missing_photos";
      return {
        ok,
        status: ok ? "pass" : "fail",
        code: json?.code ?? null,
        message: ok ? (json?.code === "missing_photos" ? "Submit guarded (missing photos)" : "Scan submitted") : json?.error || "Scan submit failed",
        data: json,
        httpStatus: response.status,
      };
    });
  }, [authHeaders, scanSession, scanSubmitProbe]);

  const handleScanDuplicate = useCallback(async () => {
    await scanDuplicateProbe.run(async () => {
      if (!scanSession) {
        throw Object.assign(new Error("missing_session"), { code: "missing_session" });
      }
      const headers = await authHeaders();
      const appCheckHeaders = hasAppCheck() ? await getAppCheckHeader(true) : {};
      const idempotencyKey = `uat-${scanSession.scanId}`;
      const response = await fetch("/api/scan/submit", {
        method: "POST",
        headers: {
          ...headers,
          ...appCheckHeaders,
        },
        body: JSON.stringify({ scanId: scanSession.scanId, idempotencyKey, mode: "uat" }),
        credentials: "include",
      });
      const json = await response.json().catch(() => ({}));
      const ok = json?.code === "duplicate_submit";
      return {
        ok,
        status: ok ? "pass" : "fail",
        code: json?.code ?? null,
        message: ok ? "Duplicate submit blocked" : json?.error || "Duplicate protection failed",
        data: json,
        httpStatus: response.status,
      };
    });
  }, [authHeaders, scanDuplicateProbe, scanSession]);

  const coachReplyProbe = useProbe<Record<string, unknown>>("Coach reply", pushLog);
  const nutritionItemsProbe = useProbe<Record<string, unknown>>("Nutrition data", pushLog);
  const barcodeProbe = useProbe<Record<string, unknown>>("Barcode lookup", pushLog);

  const handleCoachReply = useCallback(async () => {
    await coachReplyProbe.run(async () => {
      const response = await makeAuthedFetch(
        "/api/coach/chat",
        {
          method: "POST",
          body: JSON.stringify({ message: "Hello", text: "Hello" }),
        },
        { forceAppCheck: true },
      );
      const json = await response.json().catch(() => ({}));
      const reply = typeof json?.reply === "string" ? json.reply : "";
      const ok = response.ok;
      return {
        ok,
        status: ok ? "pass" : "fail",
        code: json?.code ?? null,
        message: ok ? `Reply: ${reply.slice(0, 60)}${reply.length > 60 ? "…" : ""}` : json?.error || "Coach failed",
        data: json,
        httpStatus: response.status,
      };
    });
  }, [coachReplyProbe, makeAuthedFetch]);

  const handleNutritionItems = useCallback(async () => {
    await nutritionItemsProbe.run(async () => {
      const response = await makeAuthedFetch(
        "/api/nutrition/search?q=chicken",
        {
          method: "GET",
          headers: { Accept: "application/json" },
        },
        { forceAppCheck: true },
      );
      const json = await response.json().catch(() => ({}));
      const items = Array.isArray(json?.items) ? json.items.slice(0, 3) : [];
      const ok = response.ok && items.length > 0;
      return {
        ok,
        status: ok ? "pass" : "fail",
        code: json?.code ?? null,
        message: ok ? `Top results: ${items.length}` : json?.error || "Nutrition failed",
        data: { ...json, items },
        httpStatus: response.status,
      };
    });
  }, [makeAuthedFetch, nutritionItemsProbe]);

  const handleBarcode = useCallback(async () => {
    await barcodeProbe.run(async () => {
      const response = await makeAuthedFetch(
        "/api/nutrition/barcode?code=737628064502",
        {
          method: "GET",
          headers: { Accept: "application/json" },
        },
        { forceAppCheck: true },
      );
      const json = await response.json().catch(() => ({}));
      const ok = response.ok && typeof json?.item === "object";
      return {
        ok,
        status: ok ? "pass" : "fail",
        code: json?.code ?? null,
        message: ok ? `Item: ${(json?.item?.name as string) ?? "unknown"}` : json?.error || "Barcode failed",
        data: json,
        httpStatus: response.status,
      };
    });
  }, [barcodeProbe, makeAuthedFetch]);

  const claimsProbe = useProbe("Claims refresh", pushLog);

  const handleRefreshClaims = useCallback(async () => {
    await claimsProbe.run(async () => {
      const refreshed = await refreshClaims(true);
      setPretendCredits(null);
      return {
        ok: true,
        status: "pass",
        message: "Claims refreshed",
        data: refreshed ?? {},
      };
    });
  }, [claimsProbe, refreshClaims]);

  const handleTestDeduct = useCallback(() => {
    if (pretendCredits !== null) return;
    const startingCredits = (claims?.credits as number | undefined) ?? null;
    if (startingCredits === null) {
      toast({ title: "Credits unavailable", description: "No numeric credits to adjust." });
      return;
    }
    setPretendCredits(Math.max(0, startingCredits - 1));
    setTimeout(() => {
      setPretendCredits(null);
    }, 1200);
  }, [claims?.credits, pretendCredits, toast]);

  const clearCachesProbe = useProbe("Clear caches", pushLog);

  const handleClearCaches = useCallback(async () => {
    await clearCachesProbe.run(async () => {
      try {
        if (typeof navigator !== "undefined" && navigator.serviceWorker) {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.allSettled(regs.map((reg) => reg.unregister()));
        }
        if (typeof caches !== "undefined") {
          const keys = await caches.keys();
          await Promise.allSettled(keys.map((key) => caches.delete(key)));
        }
        if (typeof localStorage !== "undefined") localStorage.clear();
        if (typeof sessionStorage !== "undefined") sessionStorage.clear();
      } catch (error) {
        return { ok: false, status: "fail", message: (error as Error)?.message ?? "Failed to clear caches" };
      }
      return { ok: true, status: "pass", message: "Caches cleared" };
    });
  }, [clearCachesProbe]);

  const handleThrowError = useCallback(() => {
    setTimeout(() => {
      throw new Error("UAT fake error triggered");
    }, 0);
  }, []);

  const currentCredits = pretendCredits ?? (typeof claims?.credits === "number" ? claims.credits : null);
  const unlimited = claims?.unlimitedCredits === true || (claims as any)?.unlimited === true;

  if (claimsLoading && !claims && !import.meta.env.DEV) {
    return (
      <div className="p-6">
        <Seo title="UAT Harness" />
        <p className="text-sm text-muted-foreground">Loading claims…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Seo title="UAT Harness" />
      <main className="mx-auto max-w-6xl space-y-6 p-6">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-semibold">UAT & Bug-Bash Harness</h1>
              <p className="text-sm text-muted-foreground">Scripted probes for auth, payments, App Check, scans, coach, and nutrition.</p>
            </div>
            <Badge variant={access.allowed ? "default" : "destructive"}>{access.allowed ? `Access: ${access.reason}` : "Access revoked"}</Badge>
          </div>
          {access.email && <p className="text-xs text-muted-foreground">Signed in as {access.email}</p>}
        </div>

        {!access.allowed && (
          <Card>
            <CardHeader>
              <CardTitle>Restricted</CardTitle>
              <CardDescription>UAT is limited to staff, allowlisted accounts, or local development.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>Sign in with a staff account or run the app locally (Vite dev server) to access probes.</p>
            </CardContent>
          </Card>
        )}

        {access.allowed && (
          <>
            <Section title="Runtime Config & Identity" description="Validate Firebase Hosting config and identity claims.">
              <div className="grid gap-3 lg:grid-cols-[auto,1fr,auto] lg:items-center">
                <Button onClick={handleRuntimeConfig} disabled={runtimeProbe.state.status === "running"}>
                  {runtimeProbe.state.status === "running" ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                  Fetch init.json
                </Button>
                <div className="space-y-1">
                  <StatusBadge state={runtimeProbe.state} />
                  <ResultLine state={runtimeProbe.state} />
                  <p className="text-xs text-muted-foreground">Last run: {formatTimestamp(runtimeProbe.state.timestamp)}</p>
                </div>
                <CopyJsonButton value={runtimeProbe.state.data} label="init.json" />
              </div>

              <div className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">Identity</p>
                    <p className="text-xs">uid: {user?.uid ?? "—"}</p>
                    <p className="text-xs">email: {user?.email ?? "—"}</p>
                  </div>
                  <div className="text-xs text-muted-foreground/80">
                    <p>staff: {claims?.staff === true ? "true" : "false"}</p>
                    <p>dev: {claims?.dev === true ? "true" : "false"}</p>
                    <p>unlimitedCredits: {claims?.unlimitedCredits === true ? "true" : "false"}</p>
                  </div>
                </div>
              </div>
            </Section>

            <Section title="Auth (Google)" description="Validate redirect support and inspect last auth redirect outcome.">
              <div className="grid gap-3 lg:grid-cols-[auto,1fr,auto] lg:items-center">
                <Button onClick={handleGoogleProbe} disabled={googleProbe.state.status === "running"}>
                  {googleProbe.state.status === "running" ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                  Auth redirect probe
                </Button>
                <div className="space-y-1">
                  <StatusBadge state={googleProbe.state} />
                  <ResultLine state={googleProbe.state} />
                </div>
                <CopyJsonButton value={googleProbe.state.data} label="auth-redirect" />
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button variant="outline" onClick={() => setAuthOutcome(peekAuthRedirectOutcome())}>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Refresh last auth event
                </Button>
                <Button variant="outline" onClick={handleGoogleRedirect}>
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Sign in with Google (redirect)
                </Button>
                <Button variant="outline" onClick={() => { consumeAuthRedirect(); toast({ title: "Redirect target cleared" }); }}>
                  <Send className="mr-2 h-4 w-4" />
                  Clear redirect target
                </Button>
              </div>

              <div className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
                <p className="font-medium">Last auth redirect</p>
                {authOutcome?.result && (
                  <p className="text-xs text-emerald-500">Result: success ({authOutcome.result.user?.uid ?? "uid"})</p>
                )}
                {authOutcome?.error && (
                  <p className="text-xs text-red-500">Error: {authOutcome.error.code ?? "unknown"}</p>
                )}
                {!authOutcome && <p className="text-xs">No redirect outcome recorded yet.</p>}
              </div>
            </Section>

            <Section title="Claims & Credits" description="Refresh custom claims and simulate credit UI updates.">
              <div className="grid gap-3 lg:grid-cols-[auto,1fr,auto] lg:items-center">
                <Button onClick={handleRefreshClaims} disabled={claimsProbe.state.status === "running"}>
                  {claimsProbe.state.status === "running" ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                  Refresh claims
                </Button>
                <div className="space-y-1">
                  <StatusBadge state={claimsProbe.state} />
                  <ResultLine state={claimsProbe.state} />
                </div>
                <CopyJsonButton value={claimsProbe.state.data} label="claims" />
              </div>

              <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                <span>Credits: {unlimited ? "∞" : currentCredits ?? "—"}</span>
                <Button variant="outline" size="sm" onClick={handleTestDeduct}>
                  Visual deduct (no-op)
                </Button>
              </div>
            </Section>

            <Section title="Payments" description="UAT-safe payments probes (X-UAT header).">
              <div className="grid gap-3 lg:grid-cols-[auto,1fr,auto] lg:items-center">
                <Button onClick={handleCheckoutDryRun} disabled={checkoutProbe.state.status === "running"}>
                  {checkoutProbe.state.status === "running" ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                  Checkout dry-run
                </Button>
                <div className="space-y-1">
                  <StatusBadge state={checkoutProbe.state} />
                  <ResultLine state={checkoutProbe.state} />
                </div>
                <CopyJsonButton value={checkoutProbe.state.data} label="checkout" />
              </div>

              <div className="grid gap-3 lg:grid-cols-[auto,1fr,auto] lg:items-center">
                <Button onClick={handlePortalDryRun} disabled={portalProbe.state.status === "running"}>
                  {portalProbe.state.status === "running" ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                  Portal dry-run
                </Button>
                <div className="space-y-1">
                  <StatusBadge state={portalProbe.state} />
                  <ResultLine state={portalProbe.state} />
                </div>
                <CopyJsonButton value={portalProbe.state.data} label="portal" />
              </div>
            </Section>

            <Section title="App Check" description="Confirm scope enforcement and token availability.">
              <div className="grid gap-3 lg:grid-cols-[auto,1fr,auto] lg:items-center">
                <Button onClick={handleAppCheckToken} disabled={appCheckTokenProbe.state.status === "running"}>
                  {appCheckTokenProbe.state.status === "running" ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                  Fetch App Check token
                </Button>
                <div className="space-y-1">
                  <StatusBadge state={appCheckTokenProbe.state} />
                  <ResultLine state={appCheckTokenProbe.state} />
                </div>
                <CopyJsonButton value={appCheckTokenProbe.state.data} label="app-check" />
              </div>

              <div className="grid gap-3 lg:grid-cols-[auto,1fr,auto] lg:items-center">
                <Button variant="outline" onClick={handleCoachNoAppCheck} disabled={coachNoAppCheckProbe.state.status === "running"}>
                  Probe coach (no token)
                </Button>
                <div className="space-y-1">
                  <StatusBadge state={coachNoAppCheckProbe.state} />
                  <ResultLine state={coachNoAppCheckProbe.state} />
                </div>
                <CopyJsonButton value={coachNoAppCheckProbe.state.data} label="coach-no-token" />
              </div>

              <div className="grid gap-3 lg:grid-cols-[auto,1fr,auto] lg:items-center">
                <Button variant="outline" onClick={handleCoachWithAppCheck} disabled={coachWithAppCheckProbe.state.status === "running"}>
                  Probe coach (with token)
                </Button>
                <div className="space-y-1">
                  <StatusBadge state={coachWithAppCheckProbe.state} />
                  <ResultLine state={coachWithAppCheckProbe.state} />
                </div>
                <CopyJsonButton value={coachWithAppCheckProbe.state.data} label="coach-with-token" />
              </div>

              <div className="grid gap-3 lg:grid-cols-[auto,1fr,auto] lg:items-center">
                <Button variant="outline" onClick={handleNutritionSearch} disabled={nutritionSearchProbe.state.status === "running"}>
                  Nutrition search with token
                </Button>
                <div className="space-y-1">
                  <StatusBadge state={nutritionSearchProbe.state} />
                  <ResultLine state={nutritionSearchProbe.state} />
                </div>
                <CopyJsonButton value={nutritionSearchProbe.state.data} label="nutrition-appcheck" />
              </div>
            </Section>

            <Section title="Scan Flow" description="Start, upload, submit, and duplicate-guard scans.">
              <div className="grid gap-3 lg:grid-cols-[auto,1fr,auto] lg:items-center">
                <Button onClick={handleScanStart} disabled={scanStartProbe.state.status === "running"}>
                  {scanStartProbe.state.status === "running" ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                  Start scan session
                </Button>
                <div className="space-y-1">
                  <StatusBadge state={scanStartProbe.state} />
                  <ResultLine state={scanStartProbe.state} />
                  {scanSession?.scanId && <p className="text-xs text-muted-foreground">scanId: {scanSession.scanId}</p>}
                </div>
                <CopyJsonButton value={scanStartProbe.state.data} label="scan-start" />
              </div>

              <div className="grid gap-3 lg:grid-cols-[auto,1fr,auto] lg:items-center">
                <Button variant="outline" onClick={handleScanUpload} disabled={scanUploadProbe.state.status === "running" || !scanSession}>
                  Upload sample bytes
                </Button>
                <div className="space-y-1">
                  <StatusBadge state={scanUploadProbe.state} />
                  <ResultLine state={scanUploadProbe.state} />
                </div>
                <CopyJsonButton value={scanUploadProbe.state.data} label="scan-upload" />
              </div>

              <div className="grid gap-3 lg:grid-cols-[auto,1fr,auto] lg:items-center">
                <Button variant="outline" onClick={handleScanSubmit} disabled={scanSubmitProbe.state.status === "running" || !scanSession}>
                  Submit scan (idempotent)
                </Button>
                <div className="space-y-1">
                  <StatusBadge state={scanSubmitProbe.state} />
                  <ResultLine state={scanSubmitProbe.state} />
                </div>
                <CopyJsonButton value={scanSubmitProbe.state.data} label="scan-submit" />
              </div>

              <div className="grid gap-3 lg:grid-cols-[auto,1fr,auto] lg:items-center">
                <Button variant="outline" onClick={handleScanDuplicate} disabled={scanDuplicateProbe.state.status === "running" || !scanSession}>
                  Repeat submit (duplicate)
                </Button>
                <div className="space-y-1">
                  <StatusBadge state={scanDuplicateProbe.state} />
                  <ResultLine state={scanDuplicateProbe.state} />
                </div>
                <CopyJsonButton value={scanDuplicateProbe.state.data} label="scan-duplicate" />
              </div>
            </Section>

            <Section title="Coach & Nutrition" description="Exercise downstream integrations with App Check.">
              <div className="grid gap-3 lg:grid-cols-[auto,1fr,auto] lg:items-center">
                <Button onClick={handleCoachReply} disabled={coachReplyProbe.state.status === "running"}>
                  Coach hello
                </Button>
                <div className="space-y-1">
                  <StatusBadge state={coachReplyProbe.state} />
                  <ResultLine state={coachReplyProbe.state} />
                </div>
                <CopyJsonButton value={coachReplyProbe.state.data} label="coach-reply" />
              </div>

              <div className="grid gap-3 lg:grid-cols-[auto,1fr,auto] lg:items-center">
                <Button variant="outline" onClick={handleNutritionItems} disabled={nutritionItemsProbe.state.status === "running"}>
                  Nutrition search “chicken”
                </Button>
                <div className="space-y-1">
                  <StatusBadge state={nutritionItemsProbe.state} />
                  <ResultLine state={nutritionItemsProbe.state} />
                </div>
                <CopyJsonButton value={nutritionItemsProbe.state.data} label="nutrition-search" />
              </div>

              <div className="grid gap-3 lg:grid-cols-[auto,1fr,auto] lg:items-center">
                <Button variant="outline" onClick={handleBarcode} disabled={barcodeProbe.state.status === "running"}>
                  Barcode 737628064502
                </Button>
                <div className="space-y-1">
                  <StatusBadge state={barcodeProbe.state} />
                  <ResultLine state={barcodeProbe.state} />
                </div>
                <CopyJsonButton value={barcodeProbe.state.data} label="barcode" />
              </div>
            </Section>

            <Section title="Diagnostics" description="Reset caches or trigger errors for telemetry.">
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="destructive" onClick={handleClearCaches} disabled={clearCachesProbe.state.status === "running"}>
                  {clearCachesProbe.state.status === "running" ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                  Unregister SW + Clear caches
                </Button>
                <Button variant="outline" onClick={handleThrowError}>
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Throw fake error
                </Button>
              </div>
              <ResultLine state={clearCachesProbe.state} />
            </Section>

            <Section title="Recent Logs" description="Last five probe results (newest first).">
              <ScrollArea className="h-48 rounded-md border">
                <div className="space-y-2 p-3 text-sm font-mono">
                  {logs.length === 0 && <p className="text-muted-foreground">No probe activity yet.</p>}
                  {logs.map((log) => (
                    <div key={`${log.at}-${log.label}`} className="space-y-1">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-semibold">{log.label}</span>
                        <span className="text-xs text-muted-foreground">{new Date(log.at).toLocaleTimeString()}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className={cn("inline-flex rounded-full px-2 py-0.5", STATUS_COLORS[log.status])}>{log.status}</span>
                        {log.code && <span>code={log.code}</span>}
                        {log.durationMs != null && <span>{formatDuration(log.durationMs)}</span>}
                      </div>
                      {log.message && <p className="text-xs text-muted-foreground">{log.message}</p>}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </Section>
          </>
        )}
      </main>
    </div>
  );
};

export default UATPage;
