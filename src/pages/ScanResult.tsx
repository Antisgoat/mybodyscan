/**
 * Pipeline map — Scan results & plan surfacing:
 * - Reads `users/{uid}/scans/{scanId}` via `getScan`, then keeps polling while status is `pending/processing`.
 * - Uses `scanStatusLabel` to translate Firestore `status`, `completedAt`, and `errorMessage` into UI copy.
 * - Once the cloud function writes `estimate` and `nutritionPlan`, renders a polished Evolt-style report.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  deserializeScanDocument,
  getScan,
  retryScanProcessingClient,
  type ScanDocument,
} from "@/lib/api/scan";
import { scanStatusLabel } from "@/lib/scanStatus";
import { formatDateTime } from "@/lib/time";
import { Seo } from "@/components/Seo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useUnits } from "@/hooks/useUnits";
import { formatHeightFromCm, formatWeightFromKg, kgToLb } from "@/lib/units";
import { useAuthUser } from "@/lib/auth";
import { useUserProfile } from "@/hooks/useUserProfile";
import { deriveNutritionGoals } from "@/lib/nutritionGoals";
import { collection, doc, getDocs, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { db, storage } from "@/lib/firebase";
import { getCachedScanPhotoUrl } from "@/lib/storage/photoUrlCache";
import silhouetteFront from "@/assets/silhouette-front.png";
import {
  describeScanPipelineStage,
  readScanPipelineState,
  updateScanPipelineState,
  type ScanPipelineState,
} from "@/lib/scanPipeline";
import { useAppCheckStatus } from "@/hooks/useAppCheckStatus";
import { computeProcessingTimeouts, latestHeartbeatMillis } from "@/lib/scanHeartbeat";
import { mark, measure, flush as flushPerf } from "@/lib/scan/perf";

const LONG_PROCESSING_WARNING_MS = 3 * 60 * 1000;
const HARD_PROCESSING_TIMEOUT_MS = 4 * 60 * 1000;
const PROCESSING_STEPS = [
  "Analyzing posture…",
  "Checking symmetry…",
  "Estimating body fat…",
  "Calculating metrics…",
  "Generating your plan…",
] as const;

export default function ScanResultPage() {
  const { scanId = "" } = useParams();
  const nav = useNavigate();
  const location = useLocation();
  const appCheckStatus = useAppCheckStatus();
  const [scan, setScan] = useState<ScanDocument | null>(null);
  const [previousScan, setPreviousScan] = useState<ScanDocument | null>(null);
  const [photoUrls, setPhotoUrls] = useState<
    Partial<Record<keyof ScanDocument["photoPaths"], string>>
  >({});
  const attemptedPhotoUrlRef = useRef<Record<string, true>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [docStatus, setDocStatus] = useState<{
    exists: boolean | null;
    fields: string[];
  }>({ exists: null, fields: [] });
  const [pipelineState, setPipelineState] = useState<ScanPipelineState | null>(
    () => readScanPipelineState(scanId)
  );
  const { units } = useUnits();
  const { user } = useAuthUser();
  const { profile, plan } = useUserProfile();
  const [processingStepIdx, setProcessingStepIdx] = useState(0);
  const [showLongProcessing, setShowLongProcessing] = useState(false);
  const [hardProcessingTimeout, setHardProcessingTimeout] = useState(false);
  const [autoRetry, setAutoRetry] = useState<{
    attempted: boolean;
    status: "idle" | "running" | "ok" | "fail";
    message?: string;
  }>({ attempted: false, status: "idle" });
  const lastMeaningfulUpdateRef = useRef<number>(Date.now());
  const scanRef = useRef<ScanDocument | null>(null);
  const lastStatusMarkRef = useRef<string | null>(null);
  const showDebug = useMemo(() => {
    if (import.meta.env.DEV) return true;
    try {
      return new URLSearchParams(location.search).get("debug") === "1";
    } catch {
      return false;
    }
  }, [location.search]);

  const updatePipeline = useCallback(
    (patch: Partial<ScanPipelineState>) => {
      if (!scanId) return null;
      const next = updateScanPipelineState(scanId, patch);
      if (next) setPipelineState(next);
      return next;
    },
    [scanId]
  );

  useEffect(() => {
    scanRef.current = scan;
  }, [scan]);

  useEffect(() => {
    setPipelineState(readScanPipelineState(scanId));
  }, [scanId]);

  useEffect(() => {
    if (!snapshotError || !scanId) return;
    let cancelled = false;
    let delay = 1500;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const poll = async () => {
      if (cancelled) return;
      try {
        const result = await getScan(scanId);
        if (cancelled) return;
        if (result.ok) {
          setScan(result.data);
          setSnapshotError(null);
          return;
        }
      } catch {
        // ignore
      }
      delay = Math.min(8000, Math.round(delay * 1.6));
      timer = setTimeout(poll, delay);
    };
    timer = setTimeout(poll, delay);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [snapshotError, scanId]);

  const needsRefresh = useMemo(() => {
    if (!scan) return false;
    return (
      scan.status === "uploading" ||
      scan.status === "uploaded" ||
      scan.status === "pending" ||
      scan.status === "queued" ||
      scan.status === "processing"
    );
  }, [scan]);

  useEffect(() => {
    let cancelled = false;
    const uid = user?.uid;

    // Always perform one HTTP fetch so we can surface API-layer debugIds cleanly.
    (async () => {
      try {
        const result = await getScan(scanId);
        if (cancelled) return;
        if (!result.ok) {
          const debugSuffix = result.error.debugId
            ? ` (ref ${result.error.debugId.slice(0, 8)})`
            : "";
          setError(result.error.message + debugSuffix);
          setLoading(false);
          return;
        }
        setScan(result.data);
        setError(null);
        setLoading(false);
        setSnapshotError(null);
        lastMeaningfulUpdateRef.current =
          latestHeartbeatMillis({
            updatedAt: result.data.updatedAt,
            heartbeatAt: result.data.processingHeartbeatAt ?? null,
            lastStepAt: result.data.lastStepAt ?? null,
          }) ?? Date.now();
      } catch (err) {
        if (cancelled) return;
        console.error("scanResult: unexpected fetch error", err);
        setError("Unable to load scan.");
        setLoading(false);
      }
    })();

    // Real-time Firestore listener (prevents “stuck processing” from stale polling).
    if (!uid || !scanId) {
      return () => {
        cancelled = true;
      };
    }
    const unsub = onSnapshot(
      doc(db, "users", uid, "scans", scanId),
      (snap) => {
        if (cancelled) return;
        setDocStatus({
          exists: snap.exists(),
          fields: snap.exists() ? Object.keys(snap.data() as Record<string, unknown>) : [],
        });
        if (!snap.exists()) return;
        const next = deserializeScanDocument(snap.id, uid, snap.data() as any);
        setScan(next);
        setError(null);
        setLoading(false);
        setSnapshotError(null);
        // Track “freshness” for long-processing UI; use updatedAt when available.
        const heartbeatMs = latestHeartbeatMillis({
          updatedAt: next.updatedAt,
          heartbeatAt: next.processingHeartbeatAt ?? null,
          lastStepAt: next.lastStepAt ?? null,
        });
        if (heartbeatMs != null) {
          lastMeaningfulUpdateRef.current = Math.max(
            lastMeaningfulUpdateRef.current,
            heartbeatMs
          );
        } else {
          lastMeaningfulUpdateRef.current = Date.now();
        }
      },
      (errSnap) => {
        console.warn("scanResult.snapshot_failed", errSnap);
        setSnapshotError(
          errSnap?.message || "Live scan updates failed. Pull to refresh."
        );
        if (!scanRef.current) {
          setError("Unable to monitor scan status. Refresh to try again.");
        }
      }
    );
    return () => {
      cancelled = true;
      unsub();
    };
  }, [scanId, user?.uid]);

  useEffect(() => {
    if (!needsRefresh) return;
    const id = setInterval(() => {
      setProcessingStepIdx((prev) => (prev + 1) % PROCESSING_STEPS.length);
    }, 2500);
    return () => clearInterval(id);
  }, [needsRefresh]);

  useEffect(() => {
    if (!scan) return;
    const normalized = (scan.status || "").toLowerCase();
    if (normalized === lastStatusMarkRef.current) return;
    lastStatusMarkRef.current = normalized;
    if (normalized === "queued" || normalized === "pending") {
      mark("queued_seen", { scanId });
    }
    if (normalized === "processing" || normalized === "in_progress") {
      mark("processing_seen", { scanId });
      measure("queued_to_processing", "queued_seen", "processing_seen", { scanId });
    }
    if (normalized === "complete" || normalized === "completed") {
      mark("complete_seen", { scanId });
      measure("processing_to_complete", "processing_seen", "complete_seen", { scanId });
      void flushPerf();
    }
  }, [scan, scanId]);

  useEffect(() => {
    if (!needsRefresh) {
      setShowLongProcessing(false);
      setHardProcessingTimeout(false);
      setAutoRetry({ attempted: false, status: "idle" });
      return;
    }
    const startAt = Date.now();
    const id = window.setInterval(() => {
      const { showLongProcessing, hardTimeout } = computeProcessingTimeouts({
        startedAt: startAt,
        lastHeartbeatAt: lastMeaningfulUpdateRef.current || null,
        warningMs: LONG_PROCESSING_WARNING_MS,
        timeoutMs: HARD_PROCESSING_TIMEOUT_MS,
      });
      setShowLongProcessing(showLongProcessing);
      setHardProcessingTimeout(hardTimeout);
    }, 1000);
    return () => window.clearInterval(id);
  }, [needsRefresh]);

  useEffect(() => {
    if (!scan) return;
    const updatedAtMs =
      scan.updatedAt instanceof Date ? scan.updatedAt.getTime() : Date.now();
    const basePatch: Partial<ScanPipelineState> = {
      lastServerStatus: scan.status,
      lastServerUpdatedAt: updatedAtMs,
      correlationId: scan.correlationId ?? undefined,
    };
    if (scan.status === "complete" || scan.status === "completed") {
      updatePipeline({
        ...basePatch,
        stage: "result_ready",
        lastError: null,
      });
    } else if (scan.status === "queued") {
      updatePipeline({
        ...basePatch,
        stage: "queued",
      });
    } else if (scan.status === "error" || scan.status === "failed") {
      updatePipeline({
        ...basePatch,
        stage: "failed",
        lastError: scan.errorMessage
          ? {
              message: scan.errorMessage,
              reason: scan.errorReason ?? undefined,
              stage: "processing_wait",
              occurredAt: Date.now(),
            }
          : undefined,
      });
    } else {
      updatePipeline({
        ...basePatch,
        stage: "processing_wait",
      });
    }
  }, [scan, updatePipeline]);

  useEffect(() => {
    if (!hardProcessingTimeout || !scan) return;
    updatePipeline({
      stage: "failed",
      lastError: {
        message: "Processing timed out. Retry processing to continue.",
        reason: "processing_timeout",
        stage: "processing_wait",
        occurredAt: Date.now(),
      },
    });
  }, [hardProcessingTimeout, scan, updatePipeline]);

  useEffect(() => {
    if (!needsRefresh) return;
    if (!showLongProcessing) return;
    if (autoRetry.attempted) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    setAutoRetry({ attempted: true, status: "running" });
    retryScanProcessingClient(scanId)
      .then((result) => {
        if (result.ok) {
          setAutoRetry({
            attempted: true,
            status: "ok",
            message: "Processing restarted. We’ll keep updating automatically.",
          });
          return;
        }
        setAutoRetry({
          attempted: true,
          status: "fail",
          message: result.error.message,
        });
      })
      .catch((err) => {
        setAutoRetry({
          attempted: true,
          status: "fail",
          message: typeof (err as any)?.message === "string" ? (err as any).message : "Retry failed.",
        });
      });
  }, [autoRetry.attempted, needsRefresh, scanId, showLongProcessing]);

  useEffect(() => {
    let cancelled = false;
    async function fetchPhotoUrls(next: ScanDocument | null) {
      if (!next) {
        setPhotoUrls({});
        return;
      }
      // Avoid noisy retries while the user is still uploading (or before submission).
      // `submitScan` verifies the 4 objects exist before enqueueing analysis.
      const canResolve =
        next.status === "queued" ||
        next.status === "processing" ||
        next.status === "complete" ||
        next.status === "completed" ||
        next.status === "error" ||
        next.status === "failed";
      if (!canResolve) return;
      const paths = next.photoPaths;
      const entries = (Object.entries(paths) as Array<
        [keyof ScanDocument["photoPaths"], string]
      >).filter(([, path]) => typeof path === "string" && path.trim().length > 0);
      if (!entries.length) {
        setPhotoUrls({});
        return;
      }
      const toFetch = entries.filter(([pose]) => !photoUrls[pose]);
      if (!toFetch.length) return;
      const scanKey = String(next.id || "");
      const resolved = await Promise.all(
        toFetch.map(async ([pose, path]) => {
          const attemptKey = `${scanKey}:${pose}:${path}`;
          if (attemptedPhotoUrlRef.current[attemptKey]) {
            return [pose, ""] as const;
          }
          attemptedPhotoUrlRef.current[attemptKey] = true;
          try {
            const cacheKey = `${scanKey}:${pose}`;
            const url = await getCachedScanPhotoUrl(storage, path, cacheKey);
            return [pose, url] as const;
          } catch {
            // Intentionally no console spam: missing photos are handled by the scan pipeline.
            return [pose, ""] as const;
          }
        })
      );
      if (cancelled) return;
      const nextUrls: Partial<Record<keyof ScanDocument["photoPaths"], string>> = {
        ...photoUrls,
      };
      for (const [pose, url] of resolved) {
        if (url) nextUrls[pose] = url;
      }
      setPhotoUrls(nextUrls);
    }
    void fetchPhotoUrls(scan);
    return () => {
      cancelled = true;
    };
  }, [scan?.id, scan?.status, scan?.photoPaths?.front, scan?.photoPaths?.back, scan?.photoPaths?.left, scan?.photoPaths?.right, photoUrls]);

  useEffect(() => {
    // Reset photo URL cache when navigating between scans.
    attemptedPhotoUrlRef.current = {};
    setPhotoUrls({});
  }, [scanId]);

  useEffect(() => {
    let cancelled = false;
    async function fetchPrevious() {
      try {
        if (!user?.uid || !scan?.createdAt) {
          setPreviousScan(null);
          return;
        }
        const q = query(
          collection(db, "users", user.uid, "scans"),
          orderBy("createdAt", "desc"),
          limit(6)
        );
        const snaps = await getDocs(q);
        if (cancelled) return;
        const docs = snaps.docs
          .map((snap) =>
            deserializeScanDocument(snap.id, user.uid, snap.data() as any)
          )
          .filter((d) => d.status === "complete" || d.status === "completed");
        const prev = docs.find((d) => d.id !== scan.id) ?? null;
        setPreviousScan(prev);
      } catch (err) {
        if (!cancelled) {
          setPreviousScan(null);
        }
      }
    }
    void fetchPrevious();
    return () => {
      cancelled = true;
    };
  }, [scan?.createdAt, scan?.id, user?.uid]);

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-3 p-4">
        <div className="h-6 w-40 animate-pulse rounded bg-black/10" />
        <div className="h-4 w-64 animate-pulse rounded bg-black/10" />
      </div>
    );
  }

  if (error || !scan) {
    return (
      <div className="mx-auto max-w-3xl space-y-3 p-4">
        <p className="text-sm text-red-700">{error || "Scan not found."}</p>
        <Button variant="outline" onClick={() => nav("/scan")}>
          Back to Scan
        </Button>
      </div>
    );
  }

  const statusMeta = scanStatusLabel(
    scan.status,
    scan.completedAt ?? scan.updatedAt ?? scan.createdAt
  );
  const lastUpdateAt =
    scan.lastStepAt ?? scan.processingHeartbeatAt ?? scan.updatedAt ?? scan.createdAt;
  const lastUpdateLabel = lastUpdateAt ? formatDateTime(lastUpdateAt) : null;

  if (statusMeta.canonical === "error" || statusMeta.recommendRescan) {
    const canResume =
      scan.status === "uploaded" ||
      scan.status === "pending" ||
      scan.status === "processing" ||
      scan.status === "error" ||
      scan.status === "failed";
    return (
      <div className="mx-auto max-w-3xl space-y-3 p-4">
        <p className="text-sm text-red-700">{statusMeta.label}</p>
        <p className="text-xs text-red-700/90">
          {scan.errorMessage ||
            statusMeta.helperText ||
            "We couldn't complete this scan."}
        </p>
        {scan.errorReason ? (
          <p className="text-xs text-muted-foreground">
            Error code: {scan.errorReason}
          </p>
        ) : null}
        {scan.errorInfo?.message ? (
          <p className="text-xs text-muted-foreground">
            Backend error: {scan.errorInfo.message}
          </p>
        ) : null}
        {pipelineState?.lastError?.message ? (
          <p className="text-xs text-muted-foreground">
            Last error: {pipelineState.lastError.message}
          </p>
        ) : null}
        <ScanPhotos photoUrls={photoUrls} />
        <div className="flex gap-2">
          <Button onClick={() => nav("/scan")}>Try again</Button>
          {canResume ? (
            <Button
              variant="outline"
              onClick={() => {
                setLoading(true);
                retryScanProcessingClient(scanId)
                  .then((result) => {
                    setLoading(false);
                    if (result.ok) return;
                    setError(result.error.message);
                  })
                  .catch((err) => {
                    setLoading(false);
                    setError(
                      typeof (err as any)?.message === "string"
                        ? (err as any).message
                        : "Retry failed."
                    );
                  });
              }}
            >
              Resume processing
            </Button>
          ) : null}
          <Button variant="outline" onClick={() => nav("/scan/history")}>
            History
          </Button>
        </div>
      </div>
    );
  }

  if (!statusMeta.showMetrics) {
    return (
      <div className="mx-auto max-w-3xl space-y-3 p-4">
        <Card className="border bg-card/60">
          <CardHeader className="space-y-1">
            <CardTitle className="text-lg">{statusMeta.label}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {statusMeta.helperText ||
                "This usually takes a minute or two. Keep this tab open if you can."}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="h-2 w-full rounded-full bg-muted">
                <div className="h-2 w-1/2 animate-pulse rounded-full bg-primary/60" />
              </div>
              <p className="text-sm text-foreground" aria-live="polite">
                {typeof scan.lastStep === "string" && scan.lastStep.trim()
                  ? scan.lastStep
                  : PROCESSING_STEPS[processingStepIdx]}
              </p>
              <p className="text-xs text-muted-foreground">
                We’ll keep updating automatically. If your connection changed, we’ll recover when you’re back online.
              </p>
            </div>
            {autoRetry.status !== "idle" ? (
              <div className="rounded-lg border bg-background/60 p-3">
                <p className="text-sm font-medium">
                  {autoRetry.status === "running"
                    ? "Restarting processing…"
                    : autoRetry.status === "ok"
                      ? "Processing restarted"
                      : "Auto-retry failed"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {autoRetry.message ??
                    (autoRetry.status === "running"
                      ? "Hang tight — we’ll keep updating."
                      : "")}
                </p>
              </div>
            ) : null}

            {hardProcessingTimeout ? (
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3">
                <p className="text-sm font-medium">This scan is taking too long</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  We won’t keep you stuck here. You can retry processing without re-uploading.
                </p>
                <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {scan.lastStep ? <div>Last stage: {scan.lastStep}</div> : null}
                  {lastUpdateLabel ? <div>Last update: {lastUpdateLabel}</div> : null}
                  {scan.errorInfo?.message ? (
                    <div>Last error: {scan.errorInfo.message}</div>
                  ) : null}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    onClick={() => {
                      setLoading(true);
                      retryScanProcessingClient(scanId)
                        .then((result) => {
                          setLoading(false);
                          if (result.ok) return;
                          setError(result.error.message);
                        })
                        .catch((err) => {
                          setLoading(false);
                          setError(
                            typeof (err as any)?.message === "string"
                              ? (err as any).message
                              : "Retry failed."
                          );
                        });
                    }}
                  >
                    Retry processing
                  </Button>
                  <Button variant="outline" onClick={() => nav("/scan")}>
                    Start new scan
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => window.location.reload()}
                  >
                    Refresh page
                  </Button>
                </div>
              </div>
            ) : showLongProcessing ? (
              <div className="rounded-lg border bg-background/60 p-3">
                <p className="text-sm font-medium">Taking longer than usual</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  If needed, we can restart processing without re-uploading.
                </p>
                <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {scan.lastStep ? <div>Current stage: {scan.lastStep}</div> : null}
                  {lastUpdateLabel ? <div>Last update: {lastUpdateLabel}</div> : null}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    onClick={() => {
                      setLoading(true);
                      retryScanProcessingClient(scanId)
                        .then((result) => {
                          setLoading(false);
                          if (result.ok) return;
                          setError(result.error.message);
                        })
                        .catch((err) => {
                          setLoading(false);
                          setError(
                            typeof (err as any)?.message === "string"
                              ? (err as any).message
                              : "Retry failed."
                          );
                        });
                    }}
                  >
                    Retry processing
                  </Button>
                  <Button type="button" variant="outline" onClick={() => nav("/scan")}>
                    Back to Scan
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      window.open(
                        `mailto:support@mybodyscanapp.com?subject=MyBodyScan%20Scan%20Stuck&body=${encodeURIComponent(
                          `scanId=${scan.id}\nstatus=${scan.status}\nlastStep=${scan.lastStep ?? ""}\nuid=${user?.uid ?? ""}\nua=${navigator.userAgent}\n`
                        )}`,
                        "_blank"
                      )
                    }
                  >
                    Contact support
                  </Button>
                </div>
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setLoading(true);
                  void getScan(scanId).then((result) => {
                    setLoading(false);
                    if (result.ok) {
                      setScan(result.data);
                      setError(null);
                    } else {
                      setError(result.error.message);
                    }
                  });
                }}
              >
                Refresh status
              </Button>
              <Button variant="outline" onClick={() => nav("/scan")}>
                Back to Scan
              </Button>
            </div>
          </CardContent>
        </Card>
        {showDebug ? (
          <details className="rounded border p-3 text-xs">
            <summary className="cursor-pointer select-none font-medium">
              Debug details
            </summary>
            <div className="mt-2 space-y-2 text-muted-foreground">
              <div>
                <span className="font-medium text-foreground">scanId:</span>{" "}
                {scanId}
              </div>
              <div>
                <span className="font-medium text-foreground">correlationId:</span>{" "}
                {scan.correlationId ?? pipelineState?.correlationId ?? "—"}
              </div>
              <div>
                <span className="font-medium text-foreground">pipeline:</span>{" "}
                {pipelineState?.stage
                  ? `${pipelineState.stage} · ${describeScanPipelineStage(
                      pipelineState.stage
                    )}`
                  : "—"}
              </div>
              <div>
                <span className="font-medium text-foreground">scan status:</span>{" "}
                {scan.status}
              </div>
              <div>
                <span className="font-medium text-foreground">last step:</span>{" "}
                {scan.lastStep ?? "—"}
              </div>
              <div>
                <span className="font-medium text-foreground">last step at:</span>{" "}
                {scan.lastStepAt ? formatDateTime(scan.lastStepAt) : "—"}
              </div>
              <div>
                <span className="font-medium text-foreground">scan progress:</span>{" "}
                {typeof scan.progress === "number" ? `${scan.progress}%` : "—"}
              </div>
              <div>
                <span className="font-medium text-foreground">last update:</span>{" "}
                {lastUpdateLabel ?? "—"}
              </div>
              {scan.errorInfo ? (
                <pre className="whitespace-pre-wrap text-[11px] text-muted-foreground">
                  {JSON.stringify(scan.errorInfo, null, 2)}
                </pre>
              ) : null}
              <div>
                <span className="font-medium text-foreground">pipeline timestamps:</span>{" "}
                {pipelineState
                  ? `created=${new Date(
                      pipelineState.createdAt
                    ).toLocaleTimeString()} · updated=${new Date(
                      pipelineState.updatedAt
                    ).toLocaleTimeString()}`
                  : "—"}
              </div>
              <div>
                <span className="font-medium text-foreground">auth:</span>{" "}
                {user?.uid ?? "—"} {user?.email ? `(${user.email})` : ""}
              </div>
              <div>
                <span className="font-medium text-foreground">app check:</span>{" "}
                {appCheckStatus.status} · tokenPresent=
                {appCheckStatus.tokenPresent ? "true" : "false"}
                {appCheckStatus.message ? ` · ${appCheckStatus.message}` : ""}
              </div>
              <div>
                <span className="font-medium text-foreground">firestore doc:</span>{" "}
                {docStatus.exists == null
                  ? "unknown"
                  : docStatus.exists
                    ? `exists (${docStatus.fields.length} fields)`
                    : "missing"}
              </div>
              <div>
                <span className="font-medium text-foreground">storage bucket:</span>{" "}
                {String(storage.app?.options?.storageBucket || "—")}
              </div>
              {docStatus.fields.length ? (
                <pre className="whitespace-pre-wrap text-[11px] text-muted-foreground">
                  {JSON.stringify(docStatus.fields, null, 2)}
                </pre>
              ) : null}
              {snapshotError ? (
                <div>
                  <span className="font-medium text-foreground">
                    snapshot error:
                  </span>{" "}
                  {snapshotError}
                </div>
              ) : null}
              {pipelineState?.lastError ? (
                <pre className="whitespace-pre-wrap text-[11px] text-muted-foreground">
                  {JSON.stringify(pipelineState.lastError, null, 2)}
                </pre>
              ) : null}
              {scan?.photoPaths ? (
                <pre className="whitespace-pre-wrap text-[11px] text-muted-foreground">
                  {JSON.stringify(scan.photoPaths, null, 2)}
                </pre>
              ) : null}
            </div>
          </details>
        ) : null}
      </div>
    );
  }

  const displayName =
    (typeof user?.displayName === "string" && user.displayName.trim()) ||
    (typeof user?.email === "string" && user.email.includes("@")
      ? user.email.split("@")[0]
      : null) ||
    "You";

  const sex =
    profile?.sex === "male" || profile?.sex === "female" ? profile.sex : null;
  const age =
    typeof profile?.age === "number" && Number.isFinite(profile.age)
      ? profile.age
      : null;

  const weightKg =
    typeof scan.input?.currentWeightKg === "number" &&
    Number.isFinite(scan.input.currentWeightKg)
      ? scan.input.currentWeightKg
      : typeof profile?.weight_kg === "number" && Number.isFinite(profile.weight_kg)
        ? profile.weight_kg
        : null;
  const heightCm =
    typeof profile?.height_cm === "number" && Number.isFinite(profile.height_cm)
      ? profile.height_cm
      : null;

  const bfPct =
    typeof scan.estimate?.bodyFatPercent === "number" &&
    Number.isFinite(scan.estimate.bodyFatPercent)
      ? scan.estimate.bodyFatPercent
      : null;

  const fatMassKg =
    weightKg != null && bfPct != null ? (weightKg * bfPct) / 100 : null;
  const leanMassKg =
    weightKg != null && fatMassKg != null ? weightKg - fatMassKg : null;

  const skeletalMuscleKg =
    leanMassKg != null ? Math.max(0, leanMassKg * 0.52) : null;
  const totalBodyWaterKg =
    leanMassKg != null ? Math.max(0, leanMassKg * 0.73) : null;
  const totalBodyWaterPct =
    totalBodyWaterKg != null && weightKg != null && weightKg > 0
      ? (totalBodyWaterKg / weightKg) * 100
      : null;

  const goalLabel = (() => {
    const goal = profile?.goal;
    if (goal === "lose_fat") return "Fat loss";
    if (goal === "gain_muscle") return "Muscle gain";
    if (goal === "improve_heart") return "Improve health";
    return "Maintain";
  })();

  const computedGoals = deriveNutritionGoals({
    weightKg: weightKg ?? null,
    bodyFatPercent: bfPct ?? null,
    goalWeightKg: scan.input?.goalWeightKg ?? null,
    goal:
      profile?.goal === "lose_fat"
        ? "lose_fat"
        : profile?.goal === "gain_muscle"
          ? "gain_muscle"
          : null,
    activityLevel: profile?.activity_level ?? null,
    overrides: {
      calories:
        typeof plan?.calorieTarget === "number" && Number.isFinite(plan.calorieTarget)
          ? plan.calorieTarget
          : undefined,
      proteinGrams:
        typeof plan?.proteinFloor === "number" && Number.isFinite(plan.proteinFloor)
          ? plan.proteinFloor
          : undefined,
    },
  });

  const bmiValue =
    heightCm != null && weightKg != null
      ? Number((weightKg / Math.pow(heightCm / 100, 2)).toFixed(1))
      : null;

  const workoutPlan = scan.workoutPlan?.weeks?.length
    ? scan.workoutPlan
    : buildFallbackWorkoutPlan();
  const weeksToShow = workoutPlan.weeks.slice(0, 1);
  const hasMoreWeeks = workoutPlan.weeks.length > 1;
  const progressionRules =
    Array.isArray(workoutPlan.progressionRules) &&
    workoutPlan.progressionRules.length
      ? workoutPlan.progressionRules
      : [
          "Add 1–2 reps per set each week until you hit the top of the rep range.",
          "When all sets hit the top range, increase load 2–5% next week.",
          "Keep 1–2 reps in reserve on compounds; push accessories closer to failure.",
          "Deload every 4–6 weeks by cutting volume in half.",
        ];

  const nutritionPlan = scan.nutritionPlan
    ? {
        ...scan.nutritionPlan,
        adjustmentRules: Array.isArray(scan.nutritionPlan.adjustmentRules)
          ? scan.nutritionPlan.adjustmentRules
          : [],
        sampleDay: Array.isArray(scan.nutritionPlan.sampleDay)
          ? scan.nutritionPlan.sampleDay
          : [],
      }
    : {
        caloriesPerDay: Math.round(computedGoals.calories),
        proteinGrams: Math.round(computedGoals.proteinGrams),
        carbsGrams: Math.round(computedGoals.carbsGrams),
        fatsGrams: Math.round(computedGoals.fatGrams),
        adjustmentRules: [
          "If weight change is <0.25 kg/week, drop 150–200 kcal.",
          "If losing >1% body weight/week, add 150–200 kcal.",
          "Keep protein constant; adjust carbs/fats first.",
        ],
        sampleDay: [],
      };

  const bodyAge = (() => {
    if (age == null || bfPct == null) return null;
    const ideal =
      sex === "female" ? 26 : sex === "male" ? 18 : 22;
    const delta = clampNumber((bfPct - ideal) * 0.4, -6, 12);
    return Math.round(age + delta);
  })();

  const bodyScore = (() => {
    // A simple 0–10 score: rewards lower BF% and higher lean mass vs weight.
    if (weightKg == null || bfPct == null || leanMassKg == null) return null;
    const bfScore =
      sex === "female"
        ? mapToScore(18, 34, bfPct, true)
        : mapToScore(10, 26, bfPct, true);
    const leanRatio = leanMassKg / weightKg;
    const leanScore = mapToScore(0.62, 0.82, leanRatio, false);
    return clampNumber(Math.round(((bfScore + leanScore) / 2) * 10) / 10, 0, 10);
  })();

  const recommendations =
    Array.isArray(scan.recommendations) && scan.recommendations.length
      ? scan.recommendations
      : defaultRecommendations(computedGoals);

  const improvementAreas =
    Array.isArray(scan.improvementAreas) && scan.improvementAreas.length
      ? scan.improvementAreas
      : Array.isArray(scan.estimate?.keyObservations) && scan.estimate.keyObservations.length
        ? scan.estimate.keyObservations
        : Array.isArray(scan.estimate?.goalRecommendations) && scan.estimate.goalRecommendations.length
          ? scan.estimate.goalRecommendations
          : [];

  const disclaimer =
    typeof scan.disclaimer === "string" && scan.disclaimer.trim()
      ? scan.disclaimer.trim()
      : "Estimates only. Not medical advice.";

  const delta = (() => {
    if (!previousScan) return null;
    const prevWeight = previousScan.input?.currentWeightKg;
    const prevBf = previousScan.estimate?.bodyFatPercent;
    const prevWeightOk =
      typeof prevWeight === "number" && Number.isFinite(prevWeight) ? prevWeight : null;
    const prevBfOk =
      typeof prevBf === "number" && Number.isFinite(prevBf) ? prevBf : null;
    if (weightKg == null || bfPct == null || prevWeightOk == null || prevBfOk == null) {
      return null;
    }
    const prevFatKg = (prevWeightOk * prevBfOk) / 100;
    const prevLeanKg = prevWeightOk - prevFatKg;
    return {
      weightKg: weightKg - prevWeightOk,
      bfPct: bfPct - prevBfOk,
      leanKg: (leanMassKg ?? 0) - prevLeanKg,
    };
  })();

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 md:p-6">
      <Seo title="Your Body Scan – MyBodyScan" description="Your scan report." />

      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">Your Body Scan</h1>
          <p className="text-sm text-muted-foreground">
            {formatDateTime(scan.completedAt ?? scan.updatedAt)} · {displayName}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => nav("/scan/history")}>
            History
          </Button>
          <Button onClick={() => nav("/scan")}>New scan</Button>
        </div>
      </header>

      <Card className="border bg-card/60">
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-lg">Overview</CardTitle>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{goalLabel}</Badge>
            {delta ? (
              <Badge variant="outline">
                vs last scan: {delta.weightKg >= 0 ? "+" : ""}
                {delta.weightKg.toFixed(1)} kg · {delta.bfPct >= 0 ? "+" : ""}
                {delta.bfPct.toFixed(1)}%
              </Badge>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="grid grid-cols-2 gap-3">
            <InfoRow label="Sex" value={sex ? capitalize(sex) : "—"} />
            <InfoRow label="Age" value={age != null ? String(age) : "—"} />
            <InfoRow
              label="Height"
              value={
                heightCm != null
                  ? units === "metric"
                    ? `${Math.round(heightCm)} cm`
                    : formatHeightFromCm(heightCm)
                  : "—"
              }
            />
            <InfoRow
              label="Weight"
              value={weightKg != null ? formatWeightFromKg(weightKg, 1, units === "metric" ? "metric" : "us") : "—"}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <InfoRow
              label="Body fat %"
              value={bfPct != null ? `${bfPct.toFixed(1)}%` : "—"}
            />
            <InfoRow
              label="BMI"
              value={
                bmiValue != null ? bmiValue.toFixed(1) : "—"
              }
            />
            <InfoRow
              label="BMR"
              value={computedGoals.bmr != null ? `${Math.round(computedGoals.bmr)} kcal` : "—"}
            />
            <InfoRow
              label="TDEE"
              value={computedGoals.tdee != null ? `${Math.round(computedGoals.tdee)} kcal` : "—"}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="border bg-card/60">
        <CardHeader>
          <CardTitle className="text-lg">Coach report</CardTitle>
          <p className="text-sm text-muted-foreground">
            Structured like a coaching chat — use this as your 8-week playbook.
          </p>
        </CardHeader>
        <CardContent className="space-y-6 text-sm">
          <section className="space-y-2">
            <h3 className="text-base font-semibold">1) Body metrics snapshot</h3>
            <ul className="space-y-1 text-muted-foreground">
              <li>
                <span className="font-medium text-foreground">Body fat:</span>{" "}
                {bfPct != null ? `${bfPct.toFixed(1)}%` : "—"}
              </li>
              <li>
                <span className="font-medium text-foreground">Fat mass:</span>{" "}
                {formatKgLb(fatMassKg, units)}
              </li>
              <li>
                <span className="font-medium text-foreground">Lean mass:</span>{" "}
                {formatKgLb(leanMassKg, units)}
              </li>
              <li>
                <span className="font-medium text-foreground">BMI:</span>{" "}
                {bmiValue != null ? bmiValue.toFixed(1) : "Add your height to calculate BMI."}
              </li>
            </ul>
            {typeof scan.estimate?.notes === "string" && scan.estimate.notes.trim() ? (
              <p className="text-xs text-muted-foreground">{scan.estimate.notes}</p>
            ) : null}
            {improvementAreas.length ? (
              <div className="pt-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Improvement areas
                </p>
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {improvementAreas.slice(0, 6).map((item, idx) => (
                    <li key={idx}>• {item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>

          <Separator />

          <section className="space-y-3">
            <div className="space-y-1">
              <h3 className="text-base font-semibold">
                2) Training plan (6-day PPL split)
              </h3>
              <p className="text-muted-foreground">{workoutPlan.summary}</p>
            </div>
            {weeksToShow.map((week) => (
              <div key={week.weekNumber} className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Week {week.weekNumber} split
                </p>
                <div className="grid gap-2 md:grid-cols-2">
                  {week.days.map((day, idx) => (
                    <div key={`${day.day}-${idx}`} className="rounded-lg border p-3">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{day.day}</span>
                        <span className="text-xs text-muted-foreground">{day.focus}</span>
                      </div>
                      <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                        {day.exercises.map((exercise, exIdx) => (
                          <li key={`${exercise.name}-${exIdx}`}>
                            {exercise.name} · {exercise.sets}x{exercise.reps}
                            {exercise.notes ? ` · ${exercise.notes}` : ""}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {hasMoreWeeks ? (
              <p className="text-xs text-muted-foreground">
                Weeks {weeksToShow.length + 1}+ follow the same split with progressive
                overload.
              </p>
            ) : null}
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Progression rules
              </p>
              <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                {progressionRules.map((rule, idx) => (
                  <li key={idx}>• {rule}</li>
                ))}
              </ul>
            </div>
          </section>

          <Separator />

          <section className="space-y-3">
            <div className="space-y-1">
              <h3 className="text-base font-semibold">3) Nutrition plan</h3>
              <p className="text-muted-foreground">
                Calories and macros tailored for your goal.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Daily calories</p>
                <p className="text-lg font-semibold">
                  {Math.round(nutritionPlan.caloriesPerDay)} kcal
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Macros</p>
                <p className="text-sm font-medium">
                  P {Math.round(nutritionPlan.proteinGrams)}g · C{" "}
                  {Math.round(nutritionPlan.carbsGrams)}g · F{" "}
                  {Math.round(nutritionPlan.fatsGrams)}g
                </p>
              </div>
            </div>
            {(nutritionPlan.trainingDay || nutritionPlan.restDay) && (
              <div className="grid gap-2 sm:grid-cols-2">
                {nutritionPlan.trainingDay ? (
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">Training day</p>
                    <p className="text-sm font-medium">
                      {Math.round(nutritionPlan.trainingDay.calories)} kcal ·{" "}
                      {Math.round(nutritionPlan.trainingDay.proteinGrams)}P /{" "}
                      {Math.round(nutritionPlan.trainingDay.carbsGrams)}C /{" "}
                      {Math.round(nutritionPlan.trainingDay.fatsGrams)}F
                    </p>
                  </div>
                ) : null}
                {nutritionPlan.restDay ? (
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">Rest day</p>
                    <p className="text-sm font-medium">
                      {Math.round(nutritionPlan.restDay.calories)} kcal ·{" "}
                      {Math.round(nutritionPlan.restDay.proteinGrams)}P /{" "}
                      {Math.round(nutritionPlan.restDay.carbsGrams)}C /{" "}
                      {Math.round(nutritionPlan.restDay.fatsGrams)}F
                    </p>
                  </div>
                ) : null}
              </div>
            )}
            {nutritionPlan.sampleDay?.length ? (
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Sample day
                </p>
                <ul className="space-y-2 text-xs text-muted-foreground">
                  {nutritionPlan.sampleDay.map((meal, idx) => (
                    <li key={`${meal.mealName}-${idx}`}>
                      <span className="font-medium text-foreground">{meal.mealName}:</span>{" "}
                      {meal.description} · {meal.calories} kcal (P {meal.proteinGrams}g · C{" "}
                      {meal.carbsGrams}g · F {meal.fatsGrams}g)
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Adjustment rules
              </p>
              <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                {nutritionPlan.adjustmentRules.map((rule, idx) => (
                  <li key={idx}>• {rule}</li>
                ))}
              </ul>
            </div>
          </section>

          <Separator />

          <section className="space-y-2">
            <h3 className="text-base font-semibold">4) Next steps</h3>
            <ul className="space-y-2 text-muted-foreground">
              {recommendations.map((item, idx) => (
                <li key={idx} className="flex gap-2">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            {disclaimer ? (
              <p className="pt-2 text-[11px] text-muted-foreground">{disclaimer}</p>
            ) : null}
          </section>
        </CardContent>
      </Card>

      <ScanPhotos photoUrls={photoUrls} />

      <div className="grid gap-4 lg:grid-cols-[1.6fr,1fr]">
        <Card className="border bg-card/60">
          <CardHeader>
            <CardTitle className="text-lg">Body composition</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <MetricCard
              label="Lean Body Mass"
              value={formatKgLb(leanMassKg, units)}
              hint={leanMassKg != null && weightKg != null ? `${Math.round((leanMassKg / weightKg) * 100)}% of weight` : undefined}
            />
            <MetricCard
              label="Skeletal Muscle Mass"
              value={formatKgLb(skeletalMuscleKg, units)}
              hint="Estimate"
            />
            <MetricCard
              label="Body Fat %"
              value={bfPct != null ? `${bfPct.toFixed(1)}%` : "—"}
            />
            <MetricCard
              label="Body Fat Mass"
              value={formatKgLb(fatMassKg, units)}
            />
            <MetricCard
              label="Total Body Water"
              value={
                totalBodyWaterKg != null
                  ? `${formatKgLbNumber(totalBodyWaterKg, units)}${totalBodyWaterPct != null ? ` · ${Math.round(totalBodyWaterPct)}%` : ""}`
                  : "—"
              }
              hint="Estimate"
            />
            <MetricCard
              label="Visceral fat"
              value={bfPct != null ? visceralLabel(bfPct, sex) : "—"}
              hint="Estimate"
            />
          </CardContent>
        </Card>

        <Card className="border bg-card/60">
          <CardHeader>
            <CardTitle className="text-lg">Score</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <CircleGauge
                label="Body age"
                value={bodyAge != null ? String(bodyAge) : "—"}
                sublabel={age != null ? `Actual: ${age}` : undefined}
                progress={bodyAge != null && age != null ? clampNumber(age / Math.max(bodyAge, 1), 0, 1) : null}
              />
              <CircleGauge
                label="Body score"
                value={bodyScore != null ? `${bodyScore.toFixed(1)}` : "—"}
                sublabel="out of 10"
                progress={bodyScore != null ? clampNumber(bodyScore / 10, 0, 1) : null}
              />
            </div>

            <div className="rounded-lg border bg-background/60 p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Segmental analysis
              </div>
              <div className="mt-3 grid grid-cols-[1fr,auto,1fr] items-center gap-3">
                <div className="space-y-1 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Upper lean</span>
                    <span className="font-medium">
                      {leanMassKg != null ? formatKgLbNumber(leanMassKg * 0.55, units) : "—"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Lower lean</span>
                    <span className="font-medium">
                      {leanMassKg != null ? formatKgLbNumber(leanMassKg * 0.45, units) : "—"}
                    </span>
                  </div>
                </div>
                <div className="flex justify-center">
                  <img
                    src={silhouetteFront}
                    alt="Body silhouette"
                    className="h-40 w-auto opacity-90"
                    loading="lazy"
                  />
                </div>
                <div className="space-y-1 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">BMR</span>
                    <span className="font-medium">
                      {computedGoals.bmr != null ? `${Math.round(computedGoals.bmr)} kcal` : "—"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">TDEE</span>
                    <span className="font-medium">
                      {computedGoals.tdee != null ? `${Math.round(computedGoals.tdee)} kcal` : "—"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border bg-card/60">
          <CardHeader>
            <CardTitle className="text-lg">Your nutrition</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <MetricCard
              label="Calories"
              value={`${rangeText(computedGoals.calories)} kcal`}
              hint={computedGoals.tdee != null ? `TDEE ~${Math.round(computedGoals.tdee)} kcal` : undefined}
            />
            <MetricCard
              label="Protein"
              value={`${Math.round(computedGoals.proteinGrams)} g`}
              hint={`${Math.round(computedGoals.proteinPct)}%`}
            />
            <MetricCard
              label="Carbs"
              value={`${Math.round(computedGoals.carbsGrams)} g`}
              hint={`${Math.round(computedGoals.carbsPct)}%`}
            />
            <MetricCard
              label="Fat"
              value={`${Math.round(computedGoals.fatGrams)} g`}
              hint={`${Math.round(computedGoals.fatPct)}%`}
            />
          </CardContent>
        </Card>

        <Card className="border bg-card/60">
          <CardHeader>
            <CardTitle className="text-lg">Coach recommendations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <ul className="space-y-2 text-sm text-foreground">
              {recommendations.map((item, idx) => (
                <li key={idx} className="flex gap-2">
                  <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            {typeof scan.estimate?.notes === "string" && scan.estimate.notes.trim() ? (
              <>
                <Separator />
                <p className="text-xs text-muted-foreground">{scan.estimate.notes}</p>
              </>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ScanPhotos({
  photoUrls,
}: {
  photoUrls: Partial<Record<"front" | "back" | "left" | "right", string>>;
}) {
  const entries = (Object.entries(photoUrls) as Array<
    ["front" | "back" | "left" | "right", string]
  >).filter(([, url]) => typeof url === "string" && url.length > 0);
  if (!entries.length) return null;
  const label: Record<string, string> = {
    front: "Front",
    back: "Back",
    left: "Left",
    right: "Right",
  };
  return (
    <Card className="border bg-card/60">
      <CardHeader>
        <CardTitle className="text-lg">Your photos</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {entries.map(([pose, url]) => (
          <a
            key={pose}
            href={url}
            target="_blank"
            rel="noreferrer"
            className="group overflow-hidden rounded-lg border bg-background/60"
            aria-label={`Open ${label[pose] ?? pose} photo`}
          >
            <img
              src={url}
              alt={`${label[pose] ?? pose} photo`}
              loading="lazy"
              className="h-48 w-full object-cover transition group-hover:scale-[1.02]"
            />
            <div className="p-2 text-center text-xs font-medium text-muted-foreground">
              {label[pose] ?? pose}
            </div>
          </a>
        ))}
      </CardContent>
    </Card>
  );
}

function MetricCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border bg-background/60 p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tracking-tight">{value}</div>
      {hint ? (
        <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
      ) : null}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-background/60 p-3">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-sm font-medium text-foreground">{value}</div>
    </div>
  );
}

function CircleGauge({
  label,
  value,
  sublabel,
  progress,
}: {
  label: string;
  value: string;
  sublabel?: string;
  progress: number | null;
}) {
  const pct = progress != null ? clampNumber(progress, 0, 1) : 0;
  const r = 34;
  const c = 2 * Math.PI * r;
  const dash = c - c * pct;
  return (
    <div className="rounded-lg border bg-background/60 p-4">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <svg width="84" height="84" viewBox="0 0 84 84" aria-hidden>
          <circle
            cx="42"
            cy="42"
            r={r}
            strokeWidth="8"
            className="fill-none stroke-muted"
          />
          <circle
            cx="42"
            cy="42"
            r={r}
            strokeWidth="8"
            className="fill-none stroke-primary"
            strokeDasharray={`${c} ${c}`}
            strokeDashoffset={dash}
            strokeLinecap="round"
            transform="rotate(-90 42 42)"
          />
        </svg>
        <div>
          <div className="text-2xl font-semibold tracking-tight">{value}</div>
          {sublabel ? (
            <div className="text-xs text-muted-foreground">{sublabel}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function formatKgLb(valueKg: number | null, units: "metric" | "us") {
  if (valueKg == null || !Number.isFinite(valueKg)) return "—";
  const kg = valueKg;
  const lb = kgToLb(kg);
  return units === "metric"
    ? `${kg.toFixed(1)} kg · ${lb.toFixed(1)} lb`
    : `${lb.toFixed(1)} lb · ${kg.toFixed(1)} kg`;
}

function formatKgLbNumber(valueKg: number, units: "metric" | "us") {
  const kg = valueKg;
  const lb = kgToLb(kg);
  return units === "metric" ? `${kg.toFixed(1)} kg` : `${lb.toFixed(1)} lb`;
}

function clampNumber(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function capitalize(s: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function mapToScore(min: number, max: number, value: number, lowerIsBetter: boolean) {
  const v = clampNumber((value - min) / (max - min), 0, 1);
  return lowerIsBetter ? 1 - v : v;
}

function rangeText(calories: number) {
  const base = Math.round(calories);
  const lo = Math.max(0, base - 50);
  const hi = base + 50;
  return `${lo.toLocaleString()}–${hi.toLocaleString()}`;
}

function visceralLabel(bfPct: number, sex: "male" | "female" | null) {
  // Lightweight heuristic label for display only.
  const thresholds = sex === "female" ? [30, 38] : [20, 28];
  if (bfPct < thresholds[0]!) return "Low";
  if (bfPct < thresholds[1]!) return "Moderate";
  return "High";
}

function defaultRecommendations(goals: ReturnType<typeof deriveNutritionGoals>): string[] {
  const protein = Math.round(goals.proteinGrams);
  const calories = Math.round(goals.calories);
  return [
    `Aim for ~${protein}g protein per day to support recovery.`,
    `Keep calories around ~${calories} kcal/day and adjust based on weekly progress.`,
    "Train 3–5x/week with progressive overload and prioritize sleep (7–9h).",
    "Hit a daily step baseline (e.g. 7–10k) to support energy balance.",
  ].slice(0, 5);
}

function buildFallbackWorkoutPlan() {
  return {
    summary:
      "6-day push/pull/legs split focused on progressive overload and balanced volume.",
    progressionRules: [
      "Add reps weekly until you reach the top of the rep range, then increase load.",
      "Keep 1–2 reps in reserve on compounds to stay consistent.",
      "Deload every 4–6 weeks if performance stalls.",
    ],
    weeks: [
      {
        weekNumber: 1,
        days: [
          {
            day: "Day 1",
            focus: "Push (chest/shoulders/triceps)",
            exercises: [
              { name: "Bench press", sets: 4, reps: "6-10" },
              { name: "Incline dumbbell press", sets: 3, reps: "8-12" },
              { name: "Overhead press", sets: 3, reps: "6-10" },
              { name: "Triceps pressdown", sets: 3, reps: "10-15" },
            ],
          },
          {
            day: "Day 2",
            focus: "Pull (back/biceps)",
            exercises: [
              { name: "Pull-ups or pulldown", sets: 4, reps: "6-10" },
              { name: "Barbell row", sets: 3, reps: "6-10" },
              { name: "Face pulls", sets: 3, reps: "12-15" },
              { name: "Biceps curl", sets: 3, reps: "10-12" },
            ],
          },
          {
            day: "Day 3",
            focus: "Legs (quads/hamstrings/glutes)",
            exercises: [
              { name: "Squat", sets: 4, reps: "5-8" },
              { name: "Romanian deadlift", sets: 3, reps: "8-10" },
              { name: "Leg press", sets: 3, reps: "10-12" },
              { name: "Calf raise", sets: 3, reps: "12-15" },
            ],
          },
          {
            day: "Day 4",
            focus: "Push (volume)",
            exercises: [
              { name: "Dumbbell bench press", sets: 3, reps: "8-12" },
              { name: "Lateral raise", sets: 3, reps: "12-15" },
              { name: "Dip or push-up", sets: 3, reps: "8-12" },
              { name: "Triceps extension", sets: 3, reps: "12-15" },
            ],
          },
          {
            day: "Day 5",
            focus: "Pull (volume)",
            exercises: [
              { name: "Chest-supported row", sets: 3, reps: "8-12" },
              { name: "Lat pulldown", sets: 3, reps: "10-12" },
              { name: "Rear delt fly", sets: 3, reps: "12-15" },
              { name: "Hammer curl", sets: 3, reps: "10-12" },
            ],
          },
          {
            day: "Day 6",
            focus: "Legs (volume)",
            exercises: [
              { name: "Front squat or goblet squat", sets: 3, reps: "8-10" },
              { name: "Hip hinge (RDL/hip thrust)", sets: 3, reps: "8-12" },
              { name: "Leg curl", sets: 3, reps: "10-12" },
              { name: "Walking lunge", sets: 2, reps: "12-16 steps" },
            ],
          },
        ],
      },
    ],
  };
}
