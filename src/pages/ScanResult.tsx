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
import { useUnits } from "@/hooks/useUnits";
import { useAuthUser } from "@/auth/mbs-auth";
import { useUserProfile } from "@/hooks/useUserProfile";
import {
  buildScanResultViewModel,
  formatKgForUnits,
} from "@/lib/scanResultViewModel";
import {
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import { db, storage } from "@/lib/firebase";
import { getCachedScanPhotoUrlMaybe } from "@/lib/storage/photoUrlCache";
import {
  describeScanPipelineStage,
  readScanPipelineState,
  updateScanPipelineState,
  type ScanPipelineState,
} from "@/lib/scanPipeline";
import { useAppCheckStatus } from "@/hooks/useAppCheckStatus";
import {
  computeProcessingTimeouts,
  latestHeartbeatMillis,
} from "@/lib/scanHeartbeat";
import { mark, measure, flush as flushPerf } from "@/lib/scan/perf";
import { TRANSFORMATION_PREVIEW_ENTRY_ENABLED } from "@/lib/flags";
import { useClaims } from "@/lib/claims";

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
  const photoUrlsRef = useRef<
    Partial<Record<keyof ScanDocument["photoPaths"], string>>
  >({});
  const [photoUrlRetryTick, setPhotoUrlRetryTick] = useState(0);
  const photoUrlRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const loggedPhotoUrlErrorRef = useRef<Record<string, true>>({});
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
  const { claims } = useClaims();
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
    const role =
      typeof (claims as any)?.role === "string"
        ? (claims as any).role.toLowerCase()
        : "";
    return Boolean(
      (claims as any)?.admin === true ||
        (claims as any)?.dev === true ||
        (claims as any)?.staff === true ||
        (claims as any)?.unlimited === true ||
        (claims as any)?.unlimitedCredits === true ||
        role === "admin" ||
        role === "dev" ||
        role === "staff"
    );
  }, [claims]);

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
    photoUrlsRef.current = photoUrls;
  }, [photoUrls]);

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
          fields: snap.exists()
            ? Object.keys(snap.data() as Record<string, unknown>)
            : [],
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
      measure("queued_to_processing", "queued_seen", "processing_seen", {
        scanId,
      });
    }
    if (normalized === "complete" || normalized === "completed") {
      mark("complete_seen", { scanId });
      measure("processing_to_complete", "processing_seen", "complete_seen", {
        scanId,
      });
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
    if (
      typeof document !== "undefined" &&
      document.visibilityState === "hidden"
    )
      return;
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
          message:
            typeof (err as any)?.message === "string"
              ? (err as any).message
              : "Retry failed.",
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
      const entries = (
        Object.entries(paths) as Array<
          [keyof ScanDocument["photoPaths"], string]
        >
      ).filter(
        ([, path]) => typeof path === "string" && path.trim().length > 0
      );
      if (!entries.length) {
        setPhotoUrls({});
        return;
      }
      const existingUrls = photoUrlsRef.current || {};
      const toFetch = entries.filter(([pose]) => !existingUrls[pose]);
      if (!toFetch.length) return;
      const scanKey = String(next.id || "");
      const uid = user?.uid ?? null;
      const resolved = await Promise.all(
        toFetch.map(async ([pose, path]) => {
          const cacheKey = `${scanKey}:${pose}`;
          const outcome = await getCachedScanPhotoUrlMaybe(
            storage,
            path,
            cacheKey
          );
          if (outcome.url) {
            return {
              pose,
              url: outcome.url,
              nextRetryAt: null as number | null,
            };
          }
          const storageErrorCode = outcome.errorCode;
          const httpStatus = outcome.httpStatus;
          const retryAt =
            typeof outcome.nextRetryAt === "number"
              ? outcome.nextRetryAt
              : null;

          // One-line diagnostics (no spam): log only once per scan+pose when it's not a simple "not found yet".
          const logKey = `${scanKey}:${pose}`;
          const codeLower = String(storageErrorCode || "").toLowerCase();
          if (
            uid &&
            !loggedPhotoUrlErrorRef.current[logKey] &&
            storageErrorCode &&
            !codeLower.includes("object-not-found") &&
            !codeLower.includes("url_not_ready")
          ) {
            loggedPhotoUrlErrorRef.current[logKey] = true;
            console.warn("scan_photo_url_unavailable", {
              uid,
              scanId: scanKey,
              pose,
              path,
              storageErrorCode,
              httpStatus,
            });
          }
          return { pose, url: "", nextRetryAt: retryAt };
        })
      );
      if (cancelled) return;
      let earliestRetryAt: number | null = null;
      setPhotoUrls((prev) => {
        const nextUrls: Partial<
          Record<keyof ScanDocument["photoPaths"], string>
        > = {
          ...prev,
        };
        for (const item of resolved) {
          if (item.url) nextUrls[item.pose] = item.url;
          if (typeof item.nextRetryAt === "number") {
            earliestRetryAt =
              earliestRetryAt == null
                ? item.nextRetryAt
                : Math.min(earliestRetryAt, item.nextRetryAt);
          }
        }
        return nextUrls;
      });

      // If any URLs are still backing off, schedule the next attempt (single timer).
      if (earliestRetryAt != null) {
        if (photoUrlRetryTimerRef.current) {
          clearTimeout(photoUrlRetryTimerRef.current);
          photoUrlRetryTimerRef.current = null;
        }
        const delayMs = Math.max(250, earliestRetryAt - Date.now());
        photoUrlRetryTimerRef.current = setTimeout(() => {
          setPhotoUrlRetryTick(Date.now());
        }, delayMs);
      }
    }
    void fetchPhotoUrls(scan);
    return () => {
      cancelled = true;
    };
  }, [
    scan?.id,
    scan?.status,
    scan?.photoPaths?.front,
    scan?.photoPaths?.back,
    scan?.photoPaths?.left,
    scan?.photoPaths?.right,
    user?.uid,
    photoUrlRetryTick,
  ]);

  useEffect(() => {
    // Reset photo URL cache when navigating between scans.
    loggedPhotoUrlErrorRef.current = {};
    setPhotoUrls({});
    if (photoUrlRetryTimerRef.current) {
      clearTimeout(photoUrlRetryTimerRef.current);
      photoUrlRetryTimerRef.current = null;
    }
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
    scan.lastStepAt ??
    scan.processingHeartbeatAt ??
    scan.updatedAt ??
    scan.createdAt;
  const lastUpdateLabel = lastUpdateAt ? formatDateTime(lastUpdateAt) : null;
  const resultVm = buildScanResultViewModel({ scan, profile, plan });

  if (statusMeta.recommendRescan && !resultVm.isFailedOrFallback) {
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
          {statusMeta.helperText ||
            "We couldn't complete this scan. Please try again."}
        </p>
        {showDebug && scan.errorReason ? (
          <p className="text-xs text-muted-foreground">
            Error code: {scan.errorReason}
          </p>
        ) : null}
        {showDebug && scan.errorInfo?.message ? (
          <p className="text-xs text-muted-foreground">
            Backend error: {scan.errorInfo.message}
          </p>
        ) : null}
        {showDebug && pipelineState?.lastError?.message ? (
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
                We’ll keep updating automatically. If your connection changed,
                we’ll recover when you’re back online.
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
                <p className="text-sm font-medium">
                  This scan is taking too long
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  We won’t keep you stuck here. You can retry processing without
                  re-uploading.
                </p>
                <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {scan.lastStep ? (
                    <div>Last stage: {scan.lastStep}</div>
                  ) : null}
                  {lastUpdateLabel ? (
                    <div>Last update: {lastUpdateLabel}</div>
                  ) : null}
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
                  {scan.lastStep ? (
                    <div>Current stage: {scan.lastStep}</div>
                  ) : null}
                  {lastUpdateLabel ? (
                    <div>Last update: {lastUpdateLabel}</div>
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
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => nav("/scan")}
                  >
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
                <span className="font-medium text-foreground">
                  correlationId:
                </span>{" "}
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
                <span className="font-medium text-foreground">
                  scan status:
                </span>{" "}
                {scan.status}
              </div>
              <div>
                <span className="font-medium text-foreground">last step:</span>{" "}
                {scan.lastStep ?? "—"}
              </div>
              <div>
                <span className="font-medium text-foreground">
                  last step at:
                </span>{" "}
                {scan.lastStepAt ? formatDateTime(scan.lastStepAt) : "—"}
              </div>
              <div>
                <span className="font-medium text-foreground">
                  scan progress:
                </span>{" "}
                {typeof scan.progress === "number" ? `${scan.progress}%` : "—"}
              </div>
              <div>
                <span className="font-medium text-foreground">
                  last update:
                </span>{" "}
                {lastUpdateLabel ?? "—"}
              </div>
              {scan.errorInfo ? (
                <pre className="whitespace-pre-wrap text-[11px] text-muted-foreground">
                  {JSON.stringify(scan.errorInfo, null, 2)}
                </pre>
              ) : null}
              <div>
                <span className="font-medium text-foreground">
                  pipeline timestamps:
                </span>{" "}
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
                <span className="font-medium text-foreground">
                  firestore doc:
                </span>{" "}
                {docStatus.exists == null
                  ? "unknown"
                  : docStatus.exists
                    ? `exists (${docStatus.fields.length} fields)`
                    : "missing"}
              </div>
              <div>
                <span className="font-medium text-foreground">
                  storage bucket:
                </span>{" "}
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

  const retryProcessing = () => {
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
  };

  if (resultVm.isFailedOrFallback) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-6">
        <Seo
          title="Scan recovery – MyBodyScan"
          description="Recover a failed scan."
        />
        <Card className="border-destructive/30 bg-destructive/5">
          <CardHeader className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle>{resultVm.failureTitle}</CardTitle>
              <Badge variant="destructive">{resultVm.sourceLabel}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              No estimate was created for this scan, so we did not generate body
              composition metrics or nutrition targets from it. You can retry
              processing the same photos or start a new scan.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {resultVm.diagnostics.refunded ? (
              <div className="rounded-lg border bg-background/80 p-3 text-sm text-muted-foreground">
                Your scan credit has been returned.
              </div>
            ) : null}
            <div className="grid gap-2 sm:grid-cols-2">
              <Button onClick={retryProcessing}>Retry processing</Button>
              <Button variant="outline" onClick={() => nav("/scan")}>
                Re-upload scan
              </Button>
              <Button variant="outline" onClick={() => nav("/scan/history")}>
                Scan history
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  window.open(
                    `mailto:support@mybodyscanapp.com?subject=MyBodyScan%20Scan%20Help&body=${encodeURIComponent(
                      `scanId=${scan.id}
status=${scan.status}`
                    )}`,
                    "_blank"
                  )
                }
              >
                Contact support
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              We do not display body fat, macros, body age, scores, or workout
              prescriptions unless the AI analysis succeeds.
            </p>
            {showDebug ? (
              <details className="rounded border bg-background/80 p-3 text-xs">
                <summary className="cursor-pointer select-none font-medium">
                  Debug details
                </summary>
                <div className="mt-2 space-y-2 text-muted-foreground">
                  <div>errorReason: {scan.errorReason ?? "—"}</div>
                  <div>backend error: {scan.errorInfo?.message ?? "—"}</div>
                  <div>
                    pipeline lastError: {pipelineState?.lastError?.message ?? "—"}
                  </div>
                  <pre className="whitespace-pre-wrap text-[11px]">
                    {JSON.stringify(
                      {
                        scanId: scan.id,
                        status: scan.status,
                        photoPaths: scan.photoPaths,
                        fields: docStatus.fields,
                        pipelineLastError: pipelineState?.lastError ?? null,
                        appCheckStatus,
                        storageBucket: storage.app?.options?.storageBucket ?? null,
                      },
                      null,
                      2
                    )}
                  </pre>
                </div>
              </details>
            ) : null}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (resultVm.isValidResult) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-4 p-4 md:p-6">
        <Seo
          title="Your Body Scan – MyBodyScan"
          description="Your scan report."
        />
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-3xl font-semibold tracking-tight">
              Your Body Scan
            </h1>
            <p className="text-sm text-muted-foreground">
              {formatDateTime(scan.completedAt ?? scan.updatedAt)} ·{" "}
              {resultVm.sourceLabel}
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
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-lg">Primary results</CardTitle>
              <Badge variant="secondary">Fitness estimates only</Badge>
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              label="Est. body fat"
              value={
                resultVm.primary.bodyFatPercent != null
                  ? `${resultVm.primary.bodyFatPercent.toFixed(1)}%`
                  : "—"
              }
            />
            <MetricCard
              label="Weight"
              value={formatKgForUnits(resultVm.primary.weightKg, units)}
            />
            <MetricCard
              label="BMI"
              value={
                resultVm.primary.bmi != null
                  ? resultVm.primary.bmi.toFixed(1)
                  : "—"
              }
            />
            <MetricCard
              label="Lean mass"
              value={formatKgForUnits(resultVm.primary.leanMassKg, units)}
              hint="Derived from weight and body-fat estimate"
            />
          </CardContent>
        </Card>

        {TRANSFORMATION_PREVIEW_ENTRY_ENABLED ? (
          <Card className="border bg-card/60">
            <CardHeader>
              <CardTitle className="text-lg">Transformation Preview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p>
                See a realistic motivational visualization of your goal physique
                once your scan and plan are ready.
              </p>
              <Button
                className="w-full sm:w-auto"
                onClick={() =>
                  nav(`/results/${scan.id}/transformation-preview`)
                }
              >
                Open Transformation Preview
              </Button>
            </CardContent>
          </Card>
        ) : null}

        <Card className="border bg-card/60">
          <CardHeader>
            <CardTitle className="text-lg">Nutrition targets</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              label="Calories"
              value={
                resultVm.nutrition.calories != null
                  ? `${resultVm.nutrition.calories} kcal`
                  : "—"
              }
            />
            <MetricCard
              label="Protein"
              value={
                resultVm.nutrition.proteinGrams != null
                  ? `${resultVm.nutrition.proteinGrams} g`
                  : "—"
              }
            />
            <MetricCard
              label="Carbs"
              value={
                resultVm.nutrition.carbsGrams != null
                  ? `${resultVm.nutrition.carbsGrams} g`
                  : "—"
              }
            />
            <MetricCard
              label="Fats"
              value={
                resultVm.nutrition.fatsGrams != null
                  ? `${resultVm.nutrition.fatsGrams} g`
                  : "—"
              }
            />
          </CardContent>
        </Card>

        <Card className="border bg-card/60">
          <CardHeader>
            <CardTitle className="text-lg">Recommended plan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="font-medium">{resultVm.plan.summary}</p>
            {resultVm.plan.detailLines.length ? (
              <ul className="space-y-1 text-muted-foreground">
                {resultVm.plan.detailLines.map((line) => (
                  <li key={line}>• {line}</li>
                ))}
              </ul>
            ) : null}
            {resultVm.plan.setupNeeded ? (
              <Button
                variant="outline"
                onClick={() => nav("/coach/onboarding")}
              >
                Complete plan setup
              </Button>
            ) : (
              <Button variant="outline" onClick={() => nav("/programs")}>
                View full plan
              </Button>
            )}
          </CardContent>
        </Card>

        <Card className="border bg-card/60">
          <CardContent className="pt-6 text-sm">
            Next scan: rescan in 10 days with the same four angles and current
            weight.
          </CardContent>
        </Card>

        <details className="rounded-lg border bg-card/60 p-4 text-sm">
          <summary className="cursor-pointer font-medium">
            View full report
          </summary>
          <div className="mt-4 space-y-4">
            <ScanPhotos photoUrls={photoUrls} />
            <pre className="whitespace-pre-wrap text-xs text-muted-foreground">
              {scan.planMarkdown || "Detailed report unavailable."}
            </pre>
          </div>
        </details>

        <p className="text-xs text-muted-foreground">
          Fitness estimates only. Not medical advice.
        </p>
      </div>
    );
  }

  return null;
}
function ScanPhotos({
  photoUrls,
}: {
  photoUrls: Partial<Record<"front" | "back" | "left" | "right", string>>;
}) {
  const entries = (
    Object.entries(photoUrls) as Array<
      ["front" | "back" | "left" | "right", string]
    >
  ).filter(([, url]) => typeof url === "string" && url.length > 0);
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
