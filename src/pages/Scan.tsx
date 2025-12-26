/**
 * Pipeline map — Scan upload & status:
 * - Collects 4 photos + weight inputs, converting to kg via `useUnits`.
 * - Calls `startScanSessionClient` to reserve Firestore `users/{uid}/scans/{scanId}` with `status: "pending"`.
 * - Preprocesses all photos client-side, then uploads via Firebase Storage resumable uploads with stall + wall-clock guards.
 * - Navigates to `/scans/{id}` once uploads finish, while `ScanResult` polls Firestore for `processing`→`complete`.
 * - On errors, surfaces actionable toasts and uses `deleteScanApi` to clean up orphaned scan docs/storage objects.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  createScanCorrelationId,
  deleteScanApi,
  startScanSessionClient,
  submitScanClient,
  type ScanUploadProgress,
} from "@/lib/api/scan";
import type { UploadMethod } from "@/lib/uploads/uploadPhoto";
import { useAuthUser } from "@/lib/useAuthUser";
import { useUnits } from "@/hooks/useUnits";
import { lbToKg } from "@/lib/units";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { computeFeatureStatuses } from "@/lib/envStatus";
import { useSystemHealth } from "@/hooks/useSystemHealth";
import { toast } from "@/hooks/use-toast";
import { toProgressBarWidth, toVisiblePercent } from "@/lib/progress";
import { apiFetch } from "@/lib/http";
import { auth, db, getFirebaseApp, getFirebaseConfig, getFirebaseStorage } from "@/lib/firebase";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { ref, uploadBytes } from "firebase/storage";
import { useAppCheckStatus } from "@/hooks/useAppCheckStatus";
import {
  clearScanPipelineState,
  describeScanPipelineStage,
  readActiveScanPipelineState,
  updateScanPipelineState,
  type ScanPipelineStage,
  type ScanPipelineState,
} from "@/lib/scanPipeline";

interface PhotoInputs {
  front: File | null;
  back: File | null;
  left: File | null;
  right: File | null;
}

export default function ScanPage() {
  const { user, loading: authLoading } = useAuthUser();
  const { units } = useUnits();
  const nav = useNavigate();
  const location = useLocation();
  const appCheckStatus = useAppCheckStatus();
  const showDebug = useMemo(() => {
    if (import.meta.env.DEV) return true;
    try {
      return new URLSearchParams(location.search).get("debug") === "1";
    } catch {
      return false;
    }
  }, [location.search]);
  const [currentWeight, setCurrentWeight] = useState("");
  const [goalWeight, setGoalWeight] = useState("");
  const [photos, setPhotos] = useState<PhotoInputs>({
    front: null,
    back: null,
    left: null,
    right: null,
  });
  const [status, setStatus] = useState<
    | "idle"
    | "starting"
    | "preparing"
    | "uploading"
    | "submitting"
    | "queued"
    | "processing"
    | "error"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  const [failureReason, setFailureReason] = useState<
    "upload_failed" | "submit_failed" | null
  >(null);
  const [statusDetail, setStatusDetail] = useState<string | null>(null);
  const [delayNotice, setDelayNotice] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadPose, setUploadPose] = useState<string | null>(null);
  const [uploadHasBytes, setUploadHasBytes] = useState(false);
  const [activeScanId, setActiveScanId] = useState<string | null>(null);
  const [scanSession, setScanSession] = useState<{
    scanId: string;
    storagePaths: { front: string; back: string; left: string; right: string };
    currentWeightKg: number;
    goalWeightKg: number;
    correlationId?: string;
  } | null>(null);
  type Pose = "front" | "back" | "left" | "right";
  type PerPhotoStatus = "preparing" | "uploading" | "retrying" | "done" | "failed";
  type FileMeta = { name: string; size: number; type: string };
  const [photoState, setPhotoState] = useState<
    Record<
      Pose,
      {
        status: PerPhotoStatus;
        percent: number;
        attempt: number;
        message?: string;
        nextRetryAt?: number;
        nextRetryDelayMs?: number;
        offline?: boolean;
        uploadMethod?: UploadMethod;
      }
    >
  >({
    front: { status: "preparing", percent: 0, attempt: 0 },
    back: { status: "preparing", percent: 0, attempt: 0 },
    left: { status: "preparing", percent: 0, attempt: 0 },
    right: { status: "preparing", percent: 0, attempt: 0 },
  });
  const activeScanRef = useRef<string | null>(null);
  const sessionFinalizedRef = useRef<boolean>(false);
  const uploadAbortRef = useRef<AbortController | null>(null);
  const lastAutoRetryAtRef = useRef<number>(0);
  const autoRetryCountRef = useRef<number>(0);
  const pipelineStageRef = useRef<ScanPipelineStage | null>(null);
  const requestIdRef = useRef<string | null>(null);
  const [persistedScan, setPersistedScan] = useState<ScanPipelineState | null>(
    () => readActiveScanPipelineState()
  );
  const [photoMeta, setPhotoMeta] = useState<
    Record<
      Pose,
      {
        original?: FileMeta;
        compressed?: FileMeta;
        preprocessDebug?: unknown;
        lastError?: { code?: string; message?: string };
        lastBytesTransferred?: number;
        lastTotalBytes?: number;
        lastFirebaseError?: { code?: string; message?: string; serverResponse?: string };
        lastUploadError?: { code?: string; message?: string; details?: unknown };
        lastTaskState?: "running" | "paused" | "success" | "canceled" | "error";
        lastProgressAt?: number;
        fullPath?: string;
        bucket?: string;
        pathMismatch?: { expected: string; actual: string };
        downloadURL?: string;
        uploadMethod?: UploadMethod;
        correlationId?: string;
        elapsedMs?: number;
      }
    >
  >({
    front: {},
    back: {},
    left: {},
    right: {},
  });
  const [lastUploadError, setLastUploadError] = useState<{
    code?: string;
    message?: string;
    pose?: Pose;
  } | null>(null);
  const [tokenInfo, setTokenInfo] = useState<{
    issuedAtTime?: string;
    expirationTime?: string;
    ageSeconds?: number;
    refreshedAt?: number;
    refreshError?: string;
  } | null>(null);
  type DebugCheckRow = { name: string; ok: boolean; detail?: string };
  const [debugChecks, setDebugChecks] = useState<DebugCheckRow[]>([]);
  const [debugChecksBusy, setDebugChecksBusy] = useState(false);
  const [uploadSmokeTest, setUploadSmokeTest] = useState<{
    status: "idle" | "running" | "pass" | "fail";
    message?: string;
    scanId?: string;
  }>({ status: "idle" });
  const { health: systemHealth } = useSystemHealth();
  const { scanConfigured } = computeFeatureStatuses(systemHealth ?? undefined);
  const openaiMissing =
    systemHealth?.openaiConfigured === false ||
    systemHealth?.openaiKeyPresent === false;

  useEffect(() => {
    if (!authLoading && !user) nav("/auth?next=/scan");
  }, [authLoading, user, nav]);

  const updatePipeline = useCallback(
    (scanId: string, patch: Partial<ScanPipelineState>) => {
      const next = updateScanPipelineState(scanId, patch);
      if (next) {
        pipelineStageRef.current = next.stage;
        setPersistedScan(next);
      }
      return next;
    },
    []
  );

  const clearPipeline = useCallback((scanId: string) => {
    clearScanPipelineState(scanId);
    pipelineStageRef.current = null;
    setPersistedScan(readActiveScanPipelineState());
  }, []);

  const runDebugChecks = useCallback(async () => {
    setDebugChecksBusy(true);
    const rows: DebugCheckRow[] = [];
    try {
      if (!user?.uid) {
        rows.push({ name: "Auth", ok: false, detail: "Signed out" });
        setDebugChecks(rows);
        return;
      }
      rows.push({ name: "Auth", ok: true, detail: `uid=${user.uid}` });

      try {
        const storage = getFirebaseStorage();
        const bytes = new Uint8Array(1024);
        bytes.fill(0x5a);
        const blob = new Blob([bytes], { type: "text/plain" });
        const path = `user_uploads/${user.uid}/debug/system-check-${Date.now()}.txt`;
        await uploadBytes(ref(storage, path), blob, { contentType: "text/plain" });
        rows.push({ name: "Storage write", ok: true, detail: path });
      } catch (err: any) {
        rows.push({
          name: "Storage write",
          ok: false,
          detail: `${err?.code ?? "error"} · ${err?.message ?? String(err)}`,
        });
      }

      try {
        const refDoc = doc(db, "users", user.uid, "diagnostics", "systemCheck");
        await setDoc(
          refDoc,
          { ranAt: serverTimestamp(), appCheck: appCheckStatus.status },
          { merge: true }
        );
        const snap = await getDoc(refDoc);
        rows.push({
          name: "Firestore write/read",
          ok: snap.exists(),
          detail: snap.exists() ? "ok" : "missing after write",
        });
      } catch (err: any) {
        rows.push({
          name: "Firestore write/read",
          ok: false,
          detail: `${err?.code ?? "error"} · ${err?.message ?? String(err)}`,
        });
      }

      try {
        const health = await apiFetch<Record<string, any>>("/system/health", { method: "GET" });
        const missing =
          Array.isArray((health as any)?.scanEngineMissing) &&
          (health as any).scanEngineMissing.length
            ? (health as any).scanEngineMissing.join(", ")
            : null;
        rows.push({
          name: "Scan engine config",
          ok: !missing,
          detail: missing
            ? `missing: ${missing}`
            : `provider=${health?.engineProvider ?? health?.provider ?? "unknown"} · model=${health?.engineModel ?? "unknown"}`,
        });
      } catch (err: any) {
        rows.push({
          name: "Scan engine config",
          ok: false,
          detail: `${err?.status ?? ""} ${err?.message ?? String(err)}`.trim(),
        });
      }
    } finally {
      setDebugChecks(rows);
      setDebugChecksBusy(false);
    }
  }, [user, appCheckStatus.status]);

  const [isOffline, setIsOffline] = useState(() => {
    try {
      return typeof navigator !== "undefined" && navigator.onLine === false;
    } catch {
      return false;
    }
  });
  useEffect(() => {
    const onOffline = () => setIsOffline(true);
    const onOnline = () => setIsOffline(false);
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, []);

  const hasRetryCountdown = useMemo(() => {
    return Object.values(photoState).some(
      (s) => s.status === "retrying" && typeof s.nextRetryAt === "number"
    );
  }, [photoState]);
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (!hasRetryCountdown) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [hasRetryCountdown]);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!showDebug) return;
      if (!user) return;
      try {
        const result = await user.getIdTokenResult();
        if (!active) return;
        const issuedAt = Date.parse(result.issuedAtTime);
        const now = Date.now();
        const ageSeconds = Number.isFinite(issuedAt) ? Math.max(0, Math.round((now - issuedAt) / 1000)) : undefined;
        setTokenInfo((prev) => ({
          ...(prev ?? {}),
          issuedAtTime: result.issuedAtTime,
          expirationTime: result.expirationTime,
          ageSeconds,
        }));
      } catch (err: any) {
        if (!active) return;
        setTokenInfo((prev) => ({
          ...(prev ?? {}),
          refreshError: typeof err?.message === "string" ? err.message : String(err),
        }));
      }
    })();
    return () => {
      active = false;
    };
  }, [showDebug, user]);

  const missingFields = useMemo(() => {
    return (
      !currentWeight ||
      !goalWeight ||
      !photos.front ||
      !photos.back ||
      !photos.left ||
      !photos.right
    );
  }, [currentWeight, goalWeight, photos]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    if (status === "uploading") {
      timer = setTimeout(() => {
        // FIX: Surface long-running uploads with actionable guidance instead of leaving users guessing.
        setDelayNotice(
          "Uploads are taking longer than usual. Keep this tab open or try again if your connection stalls."
        );
      }, 60000);
    } else if (status === "submitting" || status === "queued" || status === "processing") {
      timer = setTimeout(() => {
        setDelayNotice(
          "Analysis is still running. Keep this tab open, or check back in a minute."
        );
      }, 90000);
    } else {
      setDelayNotice(null);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [status]);

  // FIX: Centralize scan failures so we can reset UI and surface a toast consistently.
  const failFlow = (message: string, reason?: "upload_failed" | "submit_failed") => {
    setError(message);
    setStatus("error");
    setFailureReason(reason ?? null);
    setStatusDetail(null);
    if (scanSession?.scanId || activeScanRef.current) {
      const scanId = scanSession?.scanId ?? activeScanRef.current;
      if (scanId) {
        updatePipeline(scanId, {
          stage: "failed",
          lastError: {
            message,
            code: lastUploadError?.code,
            reason,
            pose: lastUploadError?.pose,
            stage: pipelineStageRef.current ?? undefined,
            requestId: requestIdRef.current ?? undefined,
            occurredAt: Date.now(),
          },
        });
      }
    }
    console.warn("scan.flow_failed", {
      scanId: scanSession?.scanId ?? activeScanRef.current ?? undefined,
      requestId: requestIdRef.current ?? undefined,
      reason,
      message,
      stage: pipelineStageRef.current ?? undefined,
    });
    toast({
      title: "Scan paused",
      description: message,
      variant: "destructive",
    });
  };

  const cleanupPendingScan = useCallback(
    async (scanId: string | null) => {
      if (!scanId) return;
      try {
        await deleteScanApi(scanId);
      } catch (cleanupError) {
        console.warn("scan.cleanup_failed", cleanupError);
      } finally {
        setActiveScanId((prev) => (prev === scanId ? null : prev));
      }
    },
    [setActiveScanId]
  );

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setStatusDetail(null);
    let sessionScanId: string | null = null;
    if (missingFields) {
      setError("Please add all four photos and enter your weights.");
      return;
    }

    const toKg = (value: string): number => {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) return Number.NaN;
      return units === "us" ? lbToKg(numeric) : numeric;
    };

    const currentWeightKg = toKg(currentWeight);
    const goalWeightKg = toKg(goalWeight);
    if (!Number.isFinite(currentWeightKg) || !Number.isFinite(goalWeightKg)) {
      setError("Please enter valid numbers for your weight goals.");
      return;
    }
    if (!scanConfigured) {
      setError(
        openaiMissing
          ? "Scan is unavailable because the AI engine (OPENAI_API_KEY) is not configured."
          : "Body scans are offline until the functions URL is configured."
      );
      return;
    }
    try {
      const scanCorrelationId = createScanCorrelationId();
      setStatus("starting");
      setFailureReason(null);
      setStatusDetail("Verifying credits and reserving secure compute…");
      const startAbort = new AbortController();
      const startTimeoutId = window.setTimeout(() => startAbort.abort(), 20_000);
      const start = await startScanSessionClient(
        {
          currentWeightKg,
          goalWeightKg,
          correlationId: scanCorrelationId,
        },
        {
          signal: startAbort.signal,
          timeoutMs: 20_000,
        }
      );
      window.clearTimeout(startTimeoutId);
      if (!start.ok) {
        const debugSuffix = start.error.debugId
          ? ` (ref ${start.error.debugId.slice(0, 8)})`
          : "";
        failFlow(start.error.message + debugSuffix);
        return;
      }

      const startedScanId = start.data.scanId;
      requestIdRef.current = start.data.debugId ?? null;
      sessionFinalizedRef.current = false;
      sessionScanId = startedScanId;
      setActiveScanId(startedScanId);
      setScanSession({
        scanId: startedScanId,
        storagePaths: start.data.storagePaths,
        currentWeightKg,
        goalWeightKg,
        correlationId: scanCorrelationId,
      });
      updatePipeline(startedScanId, {
        stage: "init",
        requestId: start.data.debugId ?? undefined,
        storagePaths: start.data.storagePaths,
        correlationId: scanCorrelationId,
        lastError: null,
      });
      setStatus("preparing");
      setStatusDetail("Preparing photos…");
      setUploadProgress(0);
      setUploadPose(null);
      setUploadHasBytes(false);
      setLastUploadError(null);
      autoRetryCountRef.current = 0;
      setPhotoState({
        front: { status: "preparing", percent: 0, attempt: 0 },
        back: { status: "preparing", percent: 0, attempt: 0 },
        left: { status: "preparing", percent: 0, attempt: 0 },
        right: { status: "preparing", percent: 0, attempt: 0 },
      });
      uploadAbortRef.current?.abort();
      const abortController = new AbortController();
      uploadAbortRef.current = abortController;
      // Force-refresh auth before uploads (Safari can hold a stale token across restores).
      try {
        await auth.currentUser?.getIdToken(true);
        if (showDebug) {
          const result = await auth.currentUser?.getIdTokenResult().catch(() => null);
          if (result) {
            const issuedAt = Date.parse(result.issuedAtTime);
            const now = Date.now();
            const ageSeconds = Number.isFinite(issuedAt)
              ? Math.max(0, Math.round((now - issuedAt) / 1000))
              : undefined;
            setTokenInfo((prev) => ({
              ...(prev ?? {}),
              issuedAtTime: result.issuedAtTime,
              expirationTime: result.expirationTime,
              ageSeconds,
              refreshedAt: Date.now(),
              refreshError: undefined,
            }));
          } else {
            setTokenInfo((prev) => ({
              ...(prev ?? {}),
              refreshedAt: Date.now(),
            }));
          }
        }
      } catch (err: any) {
        if (showDebug) {
          setTokenInfo((prev) => ({
            ...(prev ?? {}),
            refreshedAt: Date.now(),
            refreshError: typeof err?.message === "string" ? err.message : String(err),
          }));
        }
      }
      const submit = await submitScanClient(
        {
          scanId: startedScanId,
          storagePaths: start.data.storagePaths,
          photos: {
            front: photos.front!,
            back: photos.back!,
            left: photos.left!,
            right: photos.right!,
          },
          currentWeightKg,
        goalWeightKg,
        scanCorrelationId,
      },
      {
        onUploadProgress: (info: ScanUploadProgress) => {
          const filePercent = toVisiblePercent(info.percent);
          const overallPercent = toVisiblePercent(info.overallPercent);
          setUploadProgress(info.overallPercent);
          setUploadPose(info.pose);
            if (startedScanId && pipelineStageRef.current !== `upload_${info.pose}`) {
              updatePipeline(startedScanId, {
                stage: `upload_${info.pose}` as ScanPipelineStage,
              });
            }
            if (info.hasBytesTransferred) {
              setUploadHasBytes(true);
            }
            setStatus((prev) =>
              prev === "uploading" || prev === "submitting" || prev === "processing"
                ? prev
                : "uploading"
            );
            // If the last file has finished uploading, immediately move the UI into the
            // "analyzing" phase so users don't feel stuck at 100% waiting on the server.
            if (info.percent >= 0.999 && info.overallPercent >= 0.999) {
              setStatus("submitting");
              setStatusDetail("Uploads complete. Starting analysis…");
              if (startedScanId) {
                updatePipeline(startedScanId, { stage: "submit_scan" });
              }
              return;
            }
            setStatusDetail(
              `Uploading ${info.pose} photo (${filePercent}% of this file · ${overallPercent}% total)… keep this tab open.`
            );
          },
          onPhotoState: (info) => {
            setPhotoState((prev) => {
              const next = { ...prev };
              const existing = next[info.pose as Pose];
              next[info.pose as Pose] = {
                status: info.status,
                attempt: info.attempt ?? existing?.attempt ?? 0,
                percent:
                  typeof info.percent === "number"
                    ? info.percent
                    : existing?.percent ?? 0,
                message: info.message ?? existing?.message,
                nextRetryAt:
                  typeof (info as any)?.nextRetryAt === "number"
                    ? (info as any).nextRetryAt
                    : existing?.nextRetryAt,
                nextRetryDelayMs:
                  typeof (info as any)?.nextRetryDelayMs === "number"
                    ? (info as any).nextRetryDelayMs
                    : existing?.nextRetryDelayMs,
                offline:
                  typeof (info as any)?.offline === "boolean"
                    ? (info as any).offline
                    : existing?.offline,
                uploadMethod:
                  (info as any)?.uploadMethod ?? existing?.uploadMethod,
              };
              return next;
            });
            setPhotoMeta((prev) => {
              const next = { ...prev };
              const existing = next[info.pose as Pose] ?? {};
              next[info.pose as Pose] = {
                ...existing,
                original: (info as any)?.original ?? existing.original,
                compressed: (info as any)?.compressed ?? existing.compressed,
                preprocessDebug:
                  (info as any)?.preprocessDebug ?? existing.preprocessDebug,
                lastBytesTransferred:
                  typeof (info as any)?.bytesTransferred === "number"
                    ? (info as any).bytesTransferred
                    : existing.lastBytesTransferred,
                lastTotalBytes:
                  typeof (info as any)?.totalBytes === "number"
                    ? (info as any).totalBytes
                    : existing.lastTotalBytes,
                lastFirebaseError:
                  (info as any)?.lastFirebaseError ?? existing.lastFirebaseError,
                lastUploadError:
                  (info as any)?.lastUploadError ?? existing.lastUploadError,
                lastTaskState:
                  (info as any)?.taskState ?? existing.lastTaskState,
                lastProgressAt:
                  typeof (info as any)?.lastProgressAt === "number"
                    ? (info as any).lastProgressAt
                    : existing.lastProgressAt,
                fullPath: (info as any)?.fullPath ?? existing.fullPath,
                bucket: (info as any)?.bucket ?? existing.bucket,
                pathMismatch:
                  (info as any)?.pathMismatch ?? existing.pathMismatch,
                downloadURL:
                  typeof (info as any)?.downloadURL === "string"
                    ? (info as any).downloadURL
                    : existing.downloadURL,
                uploadMethod:
                  (info as any)?.uploadMethod ?? existing.uploadMethod,
                correlationId:
                  (info as any)?.correlationId ?? existing.correlationId,
                elapsedMs:
                  typeof (info as any)?.elapsedMs === "number"
                    ? (info as any).elapsedMs
                    : existing.elapsedMs,
                lastError:
                  info.status === "failed"
                    ? { code: undefined, message: info.message }
                    : existing.lastError,
              };
              return next;
            });
            if (info.status === "preparing") {
              setStatus("preparing");
              setStatusDetail("Preparing photos…");
              if (startedScanId) {
                updatePipeline(startedScanId, { stage: "preprocess" });
              }
            }
            if (info.status === "failed" && startedScanId) {
              updatePipeline(startedScanId, {
                stage: "failed",
                lastError: {
                  message: info.message ?? "Upload failed.",
                  pose: info.pose,
                  stage: `upload_${info.pose}` as ScanPipelineStage,
                  requestId: requestIdRef.current ?? undefined,
                  occurredAt: Date.now(),
                },
              });
            }
          },
          signal: abortController.signal,
          stallTimeoutMs: 20_000,
          perPhotoTimeoutMs: 60_000,
          overallTimeoutMs: 4 * 60_000,
        }
      );
      sessionFinalizedRef.current = true;
      uploadAbortRef.current = null;

      if (!submit.ok) {
        setLastUploadError({
          code: submit.error.code,
          message: submit.error.message,
          pose: (submit.error.pose as Pose | undefined) ?? undefined,
        });
        const debugSuffix = submit.error.debugId
          ? ` (ref ${submit.error.debugId.slice(0, 8)})`
          : "";
        failFlow(
          submit.error.message + debugSuffix,
          submit.error.reason === "submit_failed" ? "submit_failed" : "upload_failed"
        );
        return;
      }

      updatePipeline(startedScanId, {
        stage: "queued",
        lastError: null,
        requestId: submit.data?.debugId ?? requestIdRef.current ?? undefined,
      });
      setUploadProgress(null);
      setUploadPose(null);
      setUploadHasBytes(false);
      setStatus("queued");
      setStatusDetail(
        "Queued for processing. We’re about to analyze posture, estimate body fat, and generate your plan…"
      );
      sessionScanId = null;
      setActiveScanId(null);
      setScanSession(null);
      nav(`/scans/${startedScanId}`);
    } catch (err) {
      console.error("scan.submit.unexpected", err);
      const pose = (err as any)?.pose as string | undefined;
      setLastUploadError({
        code: (err as any)?.code,
        message: (err as any)?.message,
        pose: (pose as Pose | undefined) ?? undefined,
      });
      const message =
        typeof (err as any)?.message === "string" && (err as any).message.length
          ? (pose ? `${pose} photo failed: ${(err as any).message}` : (err as any).message)
          : "We hit an unexpected error while starting your scan. Please try again.";
      failFlow(message, "upload_failed");
      if (sessionScanId) {
        // Keep the scan doc so the user can retry failed photo(s). They can still cancel explicitly.
        setActiveScanId(sessionScanId);
        updatePipeline(sessionScanId, {
          stage: "failed",
          lastError: {
            message,
            code: (err as any)?.code,
            pose: (err as any)?.pose,
            stage: pipelineStageRef.current ?? undefined,
            requestId: requestIdRef.current ?? undefined,
            occurredAt: Date.now(),
          },
        });
      }
    }
  }

  useEffect(() => {
    activeScanRef.current = activeScanId;
  }, [activeScanId]);

  useEffect(() => {
    return () => {
      if (activeScanRef.current && !sessionFinalizedRef.current) {
        void cleanupPendingScan(activeScanRef.current);
      }
    };
  }, [cleanupPendingScan]);

  useEffect(() => {
    if (status !== "uploading") {
      setUploadProgress(null);
      setUploadPose(null);
      setUploadHasBytes(false);
    }
  }, [status]);

  const failedPoses = useMemo(() => {
    const entries = Object.entries(photoState) as Array<[Pose, (typeof photoState)[Pose]]>;
    return entries.filter(([, s]) => s.status === "failed").map(([pose]) => pose);
  }, [photoState]);

  const canRetryFailed = Boolean(scanSession?.scanId) && failedPoses.length > 0;
  const canRetrySubmit =
    Boolean(scanSession?.scanId) &&
    failureReason === "submit_failed" &&
    failedPoses.length === 0;

  const cancelScan = useCallback(async () => {
    uploadAbortRef.current?.abort();
    const scanId = scanSession?.scanId ?? activeScanRef.current;
    setStatus("idle");
    setError(null);
    setStatusDetail(null);
    setDelayNotice(null);
    setUploadProgress(null);
    setUploadPose(null);
    setUploadHasBytes(false);
    setPhotoState({
      front: { status: "preparing", percent: 0, attempt: 0 },
      back: { status: "preparing", percent: 0, attempt: 0 },
      left: { status: "preparing", percent: 0, attempt: 0 },
      right: { status: "preparing", percent: 0, attempt: 0 },
    });
    setPhotoMeta({ front: {}, back: {}, left: {}, right: {} });
    setLastUploadError(null);
    autoRetryCountRef.current = 0;
    setScanSession(null);
    setActiveScanId(null);
    if (scanId) {
      await cleanupPendingScan(scanId);
      clearPipeline(scanId);
    }
  }, [cleanupPendingScan, clearPipeline, scanSession?.scanId]);

  const retryFailed = useCallback(async () => {
    if (!scanSession) return;
    if (!canRetryFailed) return;
    setError(null);
    setLastUploadError(null);
    setStatus("uploading");
    setStatusDetail("Retrying failed photo uploads…");
    updatePipeline(scanSession.scanId, { stage: "preprocess", lastError: null });
    uploadAbortRef.current?.abort();
    const abortController = new AbortController();
    uploadAbortRef.current = abortController;
    const submit = await submitScanClient(
      {
        scanId: scanSession.scanId,
        storagePaths: scanSession.storagePaths,
        photos: {
          front: photos.front!,
          back: photos.back!,
          left: photos.left!,
          right: photos.right!,
        },
        currentWeightKg: scanSession.currentWeightKg,
        goalWeightKg: scanSession.goalWeightKg,
        scanCorrelationId: scanSession.correlationId,
      },
      {
        posesToUpload: failedPoses,
        onPhotoState: (info) => {
          setPhotoState((prev) => {
            const next = { ...prev };
            const existing = next[info.pose as Pose];
            next[info.pose as Pose] = {
              status: info.status,
              attempt: info.attempt ?? existing?.attempt ?? 0,
              percent:
                typeof info.percent === "number"
                  ? info.percent
                  : existing?.percent ?? 0,
              message: info.message ?? existing?.message,
              nextRetryAt:
                typeof (info as any)?.nextRetryAt === "number"
                  ? (info as any).nextRetryAt
                  : existing?.nextRetryAt,
              nextRetryDelayMs:
                typeof (info as any)?.nextRetryDelayMs === "number"
                  ? (info as any).nextRetryDelayMs
                  : existing?.nextRetryDelayMs,
              offline:
                typeof (info as any)?.offline === "boolean"
                  ? (info as any).offline
                  : existing?.offline,
              uploadMethod: (info as any)?.uploadMethod ?? existing?.uploadMethod,
            };
            return next;
          });
          setPhotoMeta((prev) => {
            const next = { ...prev };
            const existing = next[info.pose as Pose] ?? {};
            next[info.pose as Pose] = {
              ...existing,
              original: (info as any)?.original ?? existing.original,
              compressed: (info as any)?.compressed ?? existing.compressed,
              preprocessDebug:
                (info as any)?.preprocessDebug ?? existing.preprocessDebug,
              lastBytesTransferred:
                typeof (info as any)?.bytesTransferred === "number"
                  ? (info as any).bytesTransferred
                  : existing.lastBytesTransferred,
              lastTotalBytes:
                typeof (info as any)?.totalBytes === "number"
                  ? (info as any).totalBytes
                  : existing.lastTotalBytes,
              lastFirebaseError:
                (info as any)?.lastFirebaseError ?? existing.lastFirebaseError,
              lastTaskState: (info as any)?.taskState ?? existing.lastTaskState,
              lastProgressAt:
                typeof (info as any)?.lastProgressAt === "number"
                  ? (info as any).lastProgressAt
                  : existing.lastProgressAt,
              fullPath: (info as any)?.fullPath ?? existing.fullPath,
              bucket: (info as any)?.bucket ?? existing.bucket,
              pathMismatch: (info as any)?.pathMismatch ?? existing.pathMismatch,
              downloadURL:
                typeof (info as any)?.downloadURL === "string"
                  ? (info as any).downloadURL
                  : existing.downloadURL,
              uploadMethod: (info as any)?.uploadMethod ?? existing.uploadMethod,
              lastError:
                info.status === "failed"
                  ? { code: undefined, message: info.message }
                  : existing.lastError,
            };
            return next;
          });
        },
        onUploadProgress: (info) => {
          setUploadProgress(info.overallPercent);
          setUploadPose(info.pose);
          if (info.hasBytesTransferred) setUploadHasBytes(true);
          updatePipeline(scanSession.scanId, {
            stage: `upload_${info.pose}` as ScanPipelineStage,
          });
        },
        signal: abortController.signal,
        stallTimeoutMs: 20_000,
        perPhotoTimeoutMs: 90_000,
        overallTimeoutMs: 5 * 60_000,
      }
    );
    uploadAbortRef.current = null;
    if (!submit.ok) {
      setLastUploadError({
        code: submit.error.code,
        message: submit.error.message,
        pose: (submit.error.pose as Pose | undefined) ?? undefined,
      });
      failFlow(
        submit.error.message,
        submit.error.reason === "submit_failed" ? "submit_failed" : "upload_failed"
      );
      return;
    }
    setStatus("queued");
    setStatusDetail(
      "Queued for processing. We’re about to analyze posture, estimate body fat, and generate your plan…"
    );
    updatePipeline(scanSession.scanId, { stage: "queued", lastError: null });
    nav(`/scans/${scanSession.scanId}`);
  }, [
    canRetryFailed,
    currentWeight,
    failFlow,
    failedPoses,
    goalWeight,
    nav,
    photos,
    scanSession,
    units,
    updatePipeline,
  ]);

  const retrySubmitOnly = useCallback(async () => {
    if (!scanSession) return;
    if (!canRetrySubmit) return;
    setError(null);
    setFailureReason(null);
    setLastUploadError(null);
    setStatus("submitting");
    setStatusDetail("Retrying analysis…");
    updatePipeline(scanSession.scanId, { stage: "submit_scan", lastError: null });
    uploadAbortRef.current?.abort();
    const abortController = new AbortController();
    uploadAbortRef.current = abortController;
    const submit = await submitScanClient(
      {
        scanId: scanSession.scanId,
        storagePaths: scanSession.storagePaths,
        photos: {
          front: photos.front!,
          back: photos.back!,
          left: photos.left!,
          right: photos.right!,
        },
        currentWeightKg: scanSession.currentWeightKg,
        goalWeightKg: scanSession.goalWeightKg,
        scanCorrelationId: scanSession.correlationId,
      },
      {
        posesToUpload: [],
        signal: abortController.signal,
        stallTimeoutMs: 20_000,
        overallTimeoutMs: 3 * 60_000,
      }
    );
    uploadAbortRef.current = null;
    if (!submit.ok) {
      setLastUploadError({
        code: submit.error.code,
        message: submit.error.message,
        pose: (submit.error.pose as Pose | undefined) ?? undefined,
      });
      failFlow(
        submit.error.message,
        submit.error.reason === "submit_failed" ? "submit_failed" : "upload_failed"
      );
      return;
    }
    setStatus("queued");
    setStatusDetail(
      "Queued for processing. We’re about to analyze posture, estimate body fat, and generate your plan…"
    );
    updatePipeline(scanSession.scanId, { stage: "queued", lastError: null });
    nav(`/scans/${scanSession.scanId}`);
  }, [canRetrySubmit, failFlow, nav, photos, scanSession, updatePipeline]);

  useEffect(() => {
    const maybeAutoRetry = () => {
      if (!canRetryFailed && !canRetrySubmit) return;
      if (status !== "error") return;
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      const now = Date.now();
      if (now - lastAutoRetryAtRef.current < 15_000) return;
      if (autoRetryCountRef.current >= 2) return;
      lastAutoRetryAtRef.current = now;
      autoRetryCountRef.current += 1;
      if (canRetryFailed) {
        void retryFailed();
        return;
      }
      if (canRetrySubmit) {
        void retrySubmitOnly();
      }
    };
    const onVis = () => {
      if (document.visibilityState === "visible") maybeAutoRetry();
    };
    const onOnline = () => maybeAutoRetry();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("online", onOnline);
    };
  }, [canRetryFailed, canRetrySubmit, retryFailed, retrySubmitOnly, status]);

  const retryPose = useCallback(
    async (pose: Pose) => {
      if (!scanSession?.scanId) return;
      setError(null);
      setLastUploadError(null);
      setStatus("uploading");
      setStatusDetail(`Retrying ${pose} upload…`);
      updatePipeline(scanSession.scanId, { stage: "preprocess", lastError: null });
      uploadAbortRef.current?.abort();
      const abortController = new AbortController();
      uploadAbortRef.current = abortController;
      const submit = await submitScanClient(
        {
          scanId: scanSession.scanId,
          storagePaths: scanSession.storagePaths,
          photos: {
            front: photos.front!,
            back: photos.back!,
            left: photos.left!,
            right: photos.right!,
          },
          currentWeightKg: scanSession.currentWeightKg,
          goalWeightKg: scanSession.goalWeightKg,
          scanCorrelationId: scanSession.correlationId,
        },
        {
          posesToUpload: [pose],
          onPhotoState: (info) => {
            setPhotoState((prev) => {
              const next = { ...prev };
              const existing = next[info.pose as Pose];
              next[info.pose as Pose] = {
                status: info.status,
                attempt: info.attempt ?? existing?.attempt ?? 0,
                percent:
                  typeof info.percent === "number"
                    ? info.percent
                    : existing?.percent ?? 0,
                message: info.message ?? existing?.message,
                nextRetryAt:
                  typeof (info as any)?.nextRetryAt === "number"
                    ? (info as any).nextRetryAt
                    : existing?.nextRetryAt,
                nextRetryDelayMs:
                  typeof (info as any)?.nextRetryDelayMs === "number"
                    ? (info as any).nextRetryDelayMs
                    : existing?.nextRetryDelayMs,
                offline:
                  typeof (info as any)?.offline === "boolean"
                    ? (info as any).offline
                    : existing?.offline,
                uploadMethod: (info as any)?.uploadMethod ?? existing?.uploadMethod,
              };
              return next;
            });
            setPhotoMeta((prev) => {
              const next = { ...prev };
              const existing = next[info.pose as Pose] ?? {};
              next[info.pose as Pose] = {
                ...existing,
                original: (info as any)?.original ?? existing.original,
                compressed: (info as any)?.compressed ?? existing.compressed,
                preprocessDebug:
                  (info as any)?.preprocessDebug ?? existing.preprocessDebug,
                lastBytesTransferred:
                  typeof (info as any)?.bytesTransferred === "number"
                    ? (info as any).bytesTransferred
                    : existing.lastBytesTransferred,
                lastTotalBytes:
                  typeof (info as any)?.totalBytes === "number"
                    ? (info as any).totalBytes
                    : existing.lastTotalBytes,
                lastFirebaseError:
                  (info as any)?.lastFirebaseError ?? existing.lastFirebaseError,
                lastTaskState:
                  (info as any)?.taskState ?? existing.lastTaskState,
                lastProgressAt:
                  typeof (info as any)?.lastProgressAt === "number"
                    ? (info as any).lastProgressAt
                    : existing.lastProgressAt,
                fullPath: (info as any)?.fullPath ?? existing.fullPath,
                bucket: (info as any)?.bucket ?? existing.bucket,
                pathMismatch:
                  (info as any)?.pathMismatch ?? existing.pathMismatch,
                downloadURL:
                  typeof (info as any)?.downloadURL === "string"
                    ? (info as any).downloadURL
                    : existing.downloadURL,
                uploadMethod: (info as any)?.uploadMethod ?? existing.uploadMethod,
                lastError:
                  info.status === "failed"
                    ? { code: undefined, message: info.message }
                    : existing.lastError,
              };
              return next;
            });
          },
          onUploadProgress: (info) => {
            setUploadProgress(info.overallPercent);
            setUploadPose(info.pose);
            if (info.hasBytesTransferred) setUploadHasBytes(true);
            updatePipeline(scanSession.scanId, {
              stage: `upload_${info.pose}` as ScanPipelineStage,
            });
          },
          signal: abortController.signal,
          stallTimeoutMs: 20_000,
          perPhotoTimeoutMs: 90_000,
          overallTimeoutMs: 5 * 60_000,
        }
      );
      uploadAbortRef.current = null;
      if (!submit.ok) {
        setLastUploadError({
          code: submit.error.code,
          message: submit.error.message,
          pose: (submit.error.pose as Pose | undefined) ?? undefined,
        });
        failFlow(
          submit.error.message,
          submit.error.reason === "submit_failed" ? "submit_failed" : "upload_failed"
        );
        return;
      }
      setStatus("queued");
      setStatusDetail(
        "Queued for processing. We’re about to analyze posture, estimate body fat, and generate your plan…"
      );
      updatePipeline(scanSession.scanId, { stage: "queued", lastError: null });
      nav(`/scans/${scanSession.scanId}`);
    },
    [failFlow, nav, photos, scanSession, updatePipeline]
  );

  function onFileChange(pose: keyof PhotoInputs, fileList: FileList | null) {
    const file = fileList?.[0] ?? null;
    setPhotos((prev) => ({ ...prev, [pose]: file }));
    setPhotoMeta((prev) => {
      const next = { ...prev };
      next[pose] = {
        ...next[pose],
        original: file
          ? {
              name: file.name,
              size: file.size,
              type: file.type || "image/*",
            }
          : undefined,
        // Reset compressed info when user chooses a new file.
        compressed: undefined,
        preprocessDebug: undefined,
        lastError: undefined,
        lastFirebaseError: undefined,
        lastBytesTransferred: undefined,
        lastTotalBytes: undefined,
        lastTaskState: undefined,
        lastProgressAt: undefined,
        fullPath: undefined,
        bucket: undefined,
        pathMismatch: undefined,
      };
      return next;
    });
  }

  function formatBytes(bytes: number | undefined | null): string {
    const b = typeof bytes === "number" ? bytes : 0;
    if (!Number.isFinite(b) || b <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    const i = Math.min(units.length - 1, Math.floor(Math.log(b) / Math.log(1024)));
    const val = b / Math.pow(1024, i);
    return `${val.toFixed(val >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
  }

  function formatUploadMethod(method?: UploadMethod | string | null): string {
    if (method === "storage") return "sdk";
    if (method === "http") return "function";
    if (typeof method === "string" && method.length) return method;
    return "—";
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4">
      <h1 className="text-xl font-semibold">AI Body Scan</h1>
      <p className="text-sm text-muted-foreground">
        Upload four photos and your current/goal weight. We&apos;ll analyze your
        body composition and build a personalized workout and nutrition plan.
      </p>

      {persistedScan &&
      persistedScan.scanId &&
      (!scanSession || scanSession.scanId !== persistedScan.scanId) ? (
        <Alert>
          <AlertTitle>Resume your scan</AlertTitle>
          <AlertDescription className="space-y-2">
            <div>
              Scan {persistedScan.scanId.slice(0, 8)}… ·{" "}
              {describeScanPipelineStage(persistedScan.stage)}
            </div>
            {persistedScan.lastError?.message ? (
              <div className="text-xs text-muted-foreground">
                Last error: {persistedScan.lastError.message}
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                className="rounded border px-3 py-2 text-xs"
                onClick={() => nav(`/scans/${persistedScan.scanId}`)}
              >
                Resume scan
              </button>
              <button
                type="button"
                className="rounded border px-3 py-2 text-xs"
                onClick={() => clearPipeline(persistedScan.scanId)}
              >
                Clear in-flight scan
              </button>
            </div>
          </AlertDescription>
        </Alert>
      ) : null}

      {!scanConfigured && (
        <Alert variant="destructive">
          <AlertTitle>Scan unavailable</AlertTitle>
          <AlertDescription>
            {openaiMissing
              ? "Scan is unavailable because the AI engine (OPENAI_API_KEY) is not configured on the server."
              : "Scans are offline until the Cloud Functions base URL is configured. Ask an admin to set VITE_FUNCTIONS_URL or the dedicated scan endpoints before trying again."}
          </AlertDescription>
        </Alert>
      )}

      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="grid grid-cols-2 gap-4">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Current weight ({units === "us" ? "lb" : "kg"})
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              min="0"
              value={currentWeight}
              onChange={(e) => setCurrentWeight(e.target.value)}
              data-testid="scan-current-weight-input"
              className="rounded border px-3 py-2 text-base"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Goal weight ({units === "us" ? "lb" : "kg"})
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              min="0"
              value={goalWeight}
              onChange={(e) => setGoalWeight(e.target.value)}
              data-testid="scan-goal-weight-input"
              className="rounded border px-3 py-2 text-base"
            />
          </label>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {(["front", "back", "left", "right"] as Array<keyof PhotoInputs>).map(
            (pose) => (
              <label
                key={pose}
                className="flex flex-col gap-2 rounded border p-3 text-sm font-medium capitalize"
              >
                {pose}
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => onFileChange(pose, e.target.files)}
                  data-testid="scan-photo-input"
                  className="text-xs"
                />
                {photos[pose] ? (
                  <span className="text-xs text-muted-foreground">
                    <span className="block">
                      Original: {photos[pose]?.name} ·{" "}
                      {formatBytes(photos[pose]?.size)} ·{" "}
                      {(photos[pose]?.type || "image/*").toUpperCase()}
                    </span>
                    {photoMeta[pose as Pose]?.compressed ? (
                      <span className="block">
                        Prepared: {photoMeta[pose as Pose].compressed!.name} ·{" "}
                        {formatBytes(photoMeta[pose as Pose].compressed!.size)} ·{" "}
                        {photoMeta[pose as Pose].compressed!.type.toUpperCase()}
                      </span>
                    ) : null}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    Upload a clear {pose} photo
                  </span>
                )}
              </label>
            )
          )}
        </div>

        {error && <p className="text-sm text-red-700">{error}</p>}

        <button
          type="submit"
          disabled={missingFields || (status !== "idle" && status !== "error") || !scanConfigured}
          data-testid="scan-submit-button"
          className="w-full rounded-md bg-black px-4 py-2 text-white disabled:opacity-50"
        >
          {status === "starting" && "Starting scan…"}
          {status === "preparing" && "Preparing photos…"}
          {status === "uploading" && "Uploading photos…"}
          {status === "submitting" && "Starting analysis…"}
          {status === "queued" && "Queued…"}
          {status === "processing" && "Processing…"}
          {(status === "idle" || status === "error") && "Analyze scan"}
        </button>
        {(status === "preparing" || status === "uploading" || status === "submitting") &&
          uploadProgress !== null && (
          <div className="space-y-1">
            <div className="w-full bg-secondary h-2 rounded-full">
              <div
                className={
                  uploadHasBytes
                    ? "bg-primary h-2 rounded-full transition-all"
                    : "bg-primary/60 h-2 rounded-full animate-pulse"
                }
                style={{
                  width: uploadHasBytes
                    ? `${toProgressBarWidth(uploadProgress)}%`
                    : "30%",
                }}
              />
            </div>
            {uploadPose && (
              <p
                className="text-[11px] text-muted-foreground"
                aria-live="polite"
              >
                {uploadHasBytes
                  ? `Uploading ${uploadPose}… ${toVisiblePercent(uploadProgress)}% complete`
                  : `Uploading ${uploadPose}… (progress pending)`}
              </p>
            )}
          </div>
        )}
        {statusDetail && (
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {statusDetail}
          </p>
        )}
        {(status === "preparing" ||
          status === "uploading" ||
          status === "submitting" ||
          status === "queued" ||
          status === "processing" ||
          status === "error") && (
          <div className="space-y-2">
            {delayNotice && <p className="text-xs text-amber-600">{delayNotice}</p>}
            {isOffline && (status === "uploading" || status === "preparing") ? (
              <p className="text-xs text-amber-700" aria-live="polite">
                Connection lost — we’ll retry automatically when you’re back online.
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded border px-3 py-2 text-xs"
                onClick={cancelScan}
              >
                Cancel scan
              </button>
              {canRetryFailed && (
                <button
                  type="button"
                  className="rounded border px-3 py-2 text-xs"
                  onClick={retryFailed}
                >
                  Retry failed photo(s)
                </button>
              )}
              {failedPoses.length ? (
                <div className="flex flex-wrap gap-2">
                  {failedPoses.map((pose) => (
                    <button
                      key={pose}
                      type="button"
                      className="rounded border px-3 py-2 text-xs"
                      onClick={() => void retryPose(pose)}
                    >
                      Retry {pose} upload
                    </button>
                  ))}
                </div>
              ) : null}
              {canRetrySubmit && (
                <button
                  type="button"
                  className="rounded border px-3 py-2 text-xs"
                  onClick={retrySubmitOnly}
                >
                  Retry submit (no reupload)
                </button>
              )}
            </div>
          </div>
        )}
        {(status === "preparing" ||
          status === "uploading" ||
          status === "submitting" ||
          status === "processing" ||
          status === "error") && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Photo upload status
            </p>
            <div className="space-y-2">
              {(["front", "back", "left", "right"] as Pose[]).map((pose) => {
                const s = photoState[pose];
                const pct = Math.max(0, Math.min(100, Math.round((s?.percent ?? 0) * 100)));
                const label = pose.charAt(0).toUpperCase() + pose.slice(1);
                const retryInMs =
                  s.status === "retrying" && typeof s.nextRetryAt === "number"
                    ? Math.max(0, s.nextRetryAt - nowMs)
                    : null;
                return (
                  <div key={pose} className="rounded border p-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium">{label}</span>
                      <span className="text-muted-foreground">
                        {s.status}
                        {s.attempt ? ` (attempt ${s.attempt})` : ""}
                        {s.uploadMethod ? ` · ${s.uploadMethod.toUpperCase()}` : ""}
                        {s.status === "uploading" || s.status === "retrying" ? ` · ${pct}%` : ""}
                        {retryInMs != null && retryInMs > 0 && !isOffline
                          ? ` · retry in ${Math.ceil(retryInMs / 1000)}s`
                          : ""}
                      </span>
                    </div>
                    <div className="mt-1 h-2 w-full rounded-full bg-secondary">
                      <div
                        className={
                          s.status === "failed"
                            ? "h-2 rounded-full bg-destructive"
                            : s.status === "done"
                              ? "h-2 rounded-full bg-primary"
                              : "h-2 rounded-full bg-primary/70"
                        }
                        style={{ width: `${s.status === "done" ? 100 : pct}%` }}
                      />
                    </div>
                    {s.message ? (
                      <p className="mt-1 text-[11px] text-muted-foreground">{s.message}</p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {showDebug ? (
          <details className="rounded border p-3 text-xs">
            <summary className="cursor-pointer select-none font-medium">
              Debug details
            </summary>
            <div className="mt-2 space-y-2">
              <div className="rounded border p-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">Run debug checks</span>
                  <button
                    type="button"
                    className="rounded border px-2 py-1 text-[11px]"
                    onClick={() => void runDebugChecks()}
                    disabled={debugChecksBusy}
                  >
                    {debugChecksBusy ? "Running…" : "Run"}
                  </button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Quick auth, Storage, Firestore, and scan engine probe (dev / ?debug=1).
                </p>
                <ul className="mt-1 space-y-1">
                  {debugChecks.length === 0 ? (
                    <li className="text-[11px] text-muted-foreground">No checks run yet.</li>
                  ) : (
                    debugChecks.map((row) => (
                      <li key={row.name} className="text-[11px]">
                        <span className={row.ok ? "text-green-700" : "text-red-700"}>
                          {row.ok ? "OK" : "FAIL"}
                        </span>{" "}
                        <span className="font-medium">{row.name}</span>
                        {row.detail ? ` · ${row.detail}` : ""}
                      </li>
                    ))
                  )}
                </ul>
              </div>
              <div>
                <span className="font-medium">pipeline:</span>{" "}
                <span className="text-muted-foreground">
                  {persistedScan?.stage
                    ? `${persistedScan.stage} · updated ${new Date(
                        persistedScan.updatedAt
                      ).toLocaleTimeString()}`
                    : "—"}
                </span>
              </div>
              <div>
                <span className="font-medium">upload strategy:</span>{" "}
                <span className="text-muted-foreground">
                  {persistedScan?.uploadStrategy ?? "—"}
                </span>
              </div>
              <div>
                <span className="font-medium">firebase:</span>
                <pre className="mt-1 whitespace-pre-wrap text-[11px] text-muted-foreground">
                  {(() => {
                    const cfg = getFirebaseConfig();
                    const appBucket = String(getFirebaseApp().options?.storageBucket || "");
                    return JSON.stringify(
                      {
                        projectId: cfg?.projectId,
                        authDomain: cfg?.authDomain,
                        storageBucket: cfg?.storageBucket,
                        storageBucketApp: appBucket || null,
                      },
                      null,
                      2
                    );
                  })()}
                </pre>
              </div>
              <div>
                <span className="font-medium">upload diagnostics:</span>
                <div className="mt-1 space-y-2 rounded border p-2">
                  <div className="text-[11px] text-muted-foreground">
                    uid={user?.uid ?? "—"} · scanId=
                    {scanSession?.scanId ?? activeScanId ?? persistedScan?.scanId ?? "—"}
                  </div>
                  {(() => {
                    const debugPaths =
                      (scanSession?.storagePaths as Partial<Record<Pose, string>> | undefined) ??
                      (persistedScan?.storagePaths as Partial<Record<Pose, string>> | undefined) ??
                      null;
                    if (!debugPaths) {
                      return (
                        <p className="text-[11px] text-muted-foreground">No storage paths yet.</p>
                      );
                    }
                    return (
                      <ul className="space-y-2">
                        {(["front", "back", "left", "right"] as Pose[]).map((pose) => {
                          const path = debugPaths?.[pose];
                          const meta = photoMeta[pose];
                          const pct = Math.max(
                            0,
                            Math.min(100, Math.round((photoState[pose]?.percent ?? 0) * 100))
                          );
                          return (
                            <li key={pose} className="text-[11px]">
                              <div className="font-medium">{pose}</div>
                              <div className="text-muted-foreground break-all">
                                path={path ?? "—"}
                                {meta.downloadURL ? ` · url=${meta.downloadURL}` : ""}
                                {pct ? ` · progress=${pct}%` : ""}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    );
                  })()}
                </div>
              </div>
              <div>
                <span className="font-medium">device:</span>{" "}
                <span className="text-muted-foreground">
                  {(() => {
                    const anyDebug =
                      (photoMeta.front.preprocessDebug as any)?.device ??
                      (photoMeta.back.preprocessDebug as any)?.device ??
                      (photoMeta.left.preprocessDebug as any)?.device ??
                      (photoMeta.right.preprocessDebug as any)?.device ??
                      null;
                    if (!anyDebug) return "—";
                    const mode = anyDebug.isMobileUploadDevice ? "mobile" : "desktop";
                    const safari = anyDebug.isProbablyMobileSafari ? " (iOS Safari)" : "";
                    return `${mode}${safari}`;
                  })()}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="rounded border px-3 py-2 text-xs"
                  onClick={() => {
                    try {
                      const key = "mbs.debug.freezeUpload";
                      const prev = window.localStorage.getItem(key);
                      const next = prev === "1" ? "0" : "1";
                      window.localStorage.setItem(key, next);
                      toast({
                        title: "Debug toggle updated",
                        description:
                          next === "1"
                            ? "Simulated frozen upload enabled (next upload should time out and recover)."
                            : "Simulated frozen upload disabled.",
                      });
                    } catch {
                      toast({
                        title: "Debug toggle failed",
                        description: "Could not access localStorage on this device.",
                        variant: "destructive",
                      });
                    }
                  }}
                >
                  Toggle simulated frozen upload
                </button>
                <span className="text-muted-foreground">
                  {(() => {
                    try {
                      return window.localStorage.getItem("mbs.debug.freezeUpload") === "1"
                        ? "ON"
                        : "OFF";
                    } catch {
                      return "—";
                    }
                  })()}
                </span>
              </div>
              <div>
                <span className="font-medium">uid:</span>{" "}
                <span className="text-muted-foreground">{user?.uid ?? "—"}</span>
              </div>
              <div>
                <span className="font-medium">auth token:</span>{" "}
                <span className="text-muted-foreground">
                  {tokenInfo?.issuedAtTime
                    ? `iat=${tokenInfo.issuedAtTime} · exp=${tokenInfo.expirationTime} · age=${tokenInfo.ageSeconds ?? "?"}s`
                    : "—"}
                  {tokenInfo?.refreshedAt
                    ? ` · refreshedAt=${new Date(tokenInfo.refreshedAt).toLocaleTimeString()}`
                    : ""}
                  {tokenInfo?.refreshError ? ` · refreshError=${tokenInfo.refreshError}` : ""}
                </span>
              </div>
              <div>
                <span className="font-medium">app check:</span>{" "}
                <span className="text-muted-foreground">
                  {appCheckStatus.status} · tokenPresent=
                  {appCheckStatus.tokenPresent ? "true" : "false"}
                  {appCheckStatus.message ? ` · ${appCheckStatus.message}` : ""}
                </span>
              </div>
              <div>
                <span className="font-medium">scanId:</span>{" "}
                <span className="text-muted-foreground">
                  {scanSession?.scanId ?? activeScanId ?? "—"}
                </span>
              </div>
              <div>
                <span className="font-medium">correlationId:</span>{" "}
                <span className="text-muted-foreground">
                  {scanSession?.correlationId ?? persistedScan?.correlationId ?? "—"}
                </span>
              </div>
              <div>
                <span className="font-medium">requestId:</span>{" "}
                <span className="text-muted-foreground">
                  {requestIdRef.current ?? persistedScan?.requestId ?? "—"}
                </span>
              </div>
              <div>
                <span className="font-medium">storage paths:</span>
                <pre className="mt-1 whitespace-pre-wrap text-[11px] text-muted-foreground">
                  {scanSession?.storagePaths
                    ? JSON.stringify(scanSession.storagePaths, null, 2)
                    : "—"}
                </pre>
              </div>
              <div>
                <span className="font-medium">last error:</span>{" "}
                <span className="text-muted-foreground">
                  {lastUploadError
                    ? `${lastUploadError.code ?? "unknown"} · ${
                        lastUploadError.message ?? ""
                      }${lastUploadError.pose ? ` · pose=${lastUploadError.pose}` : ""}`
                    : "—"}
                </span>
              </div>
              {persistedScan?.lastError ? (
                <pre className="whitespace-pre-wrap text-[11px] text-muted-foreground">
                  {JSON.stringify(persistedScan.lastError, null, 2)}
                </pre>
              ) : null}
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="rounded border px-3 py-2 text-xs"
                    disabled={uploadSmokeTest.status === "running"}
                    onClick={async () => {
                      const uid = auth.currentUser?.uid;
                      if (!uid) {
                        setUploadSmokeTest({
                          status: "fail",
                          message: "Not signed in.",
                        });
                        return;
                      }
                      setUploadSmokeTest({ status: "running" });
                      try {
                        const blob = await new Promise<Blob>((resolve, reject) => {
                          const canvas = document.createElement("canvas");
                          canvas.width = 2;
                          canvas.height = 2;
                          const ctx = canvas.getContext("2d");
                          if (!ctx) {
                            reject(new Error("Canvas unavailable."));
                            return;
                          }
                          ctx.fillStyle = "#e1e1e1";
                          ctx.fillRect(0, 0, 2, 2);
                          canvas.toBlob(
                            (result) =>
                              result ? resolve(result) : reject(new Error("Blob unavailable.")),
                            "image/jpeg",
                            0.7
                          );
                        });
                        const debugFile = new File([blob], "debug.jpg", { type: "image/jpeg" });
                        const start = await startScanSessionClient({
                          currentWeightKg: 80,
                          goalWeightKg: 75,
                          correlationId: `debug-${Date.now()}`,
                        });
                        if (!start.ok) {
                          throw new Error(start.error.message);
                        }
                        const response = await submitScanClient(
                          {
                            scanId: start.data.scanId,
                            storagePaths: start.data.storagePaths,
                            photos: {
                              front: debugFile,
                              back: debugFile,
                              left: debugFile,
                              right: debugFile,
                            },
                            currentWeightKg: 80,
                            goalWeightKg: 75,
                            scanCorrelationId: start.data.correlationId,
                          },
                          { overallTimeoutMs: 20_000 }
                        );
                        const scanId = response.ok
                          ? response.data.scanId ?? start.data.scanId
                          : start.data.scanId;
                        setUploadSmokeTest({
                          status: response.ok ? "pass" : "fail",
                          message: response.ok ? undefined : response.error.message,
                          scanId,
                        });
                        await deleteScanApi(start.data.scanId).catch(() => undefined);
                      } catch (err: any) {
                        setUploadSmokeTest({
                          status: "fail",
                          message: typeof err?.message === "string" ? err.message : String(err),
                        });
                      }
                    }}
                  >
                    Multipart upload test
                  </button>
                  {uploadSmokeTest.status !== "idle" ? (
                    <span className="text-muted-foreground">
                      {uploadSmokeTest.status === "running"
                        ? "running…"
                        : uploadSmokeTest.status === "pass"
                          ? `PASS · ${uploadSmokeTest.scanId ?? "unknown"}`
                          : `FAIL · ${uploadSmokeTest.message ?? "unknown error"}`}
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="space-y-2">
                {(["front", "back", "left", "right"] as Pose[]).map((pose) => {
                  const meta = photoMeta[pose];
                  const state = photoState[pose];
                  return (
                    <div key={pose} className="rounded border p-2">
                      <div className="font-medium">{pose}</div>
                      <div className="text-muted-foreground">
                        state: {state.status} · attempt {state.attempt || 0} · method{" "}
                        {formatUploadMethod(state.uploadMethod)}
                      </div>
                      <div className="text-muted-foreground">
                        original:{" "}
                        {meta.original
                          ? `${meta.original.size} bytes · ${meta.original.type} · ${meta.original.name}`
                          : "—"}
                      </div>
                      <div className="text-muted-foreground">
                        prepared:{" "}
                        {meta.compressed
                          ? `${meta.compressed.size} bytes · ${meta.compressed.type} · ${meta.compressed.name}`
                          : "—"}
                      </div>
                      {meta.uploadMethod ? (
                        <div className="text-muted-foreground">
                          methodUsed: {formatUploadMethod(meta.uploadMethod)}
                        </div>
                      ) : null}
                      {meta.correlationId ? (
                        <div className="text-muted-foreground">
                          correlationId: {meta.correlationId}
                        </div>
                      ) : null}
                      {typeof meta.elapsedMs === "number" ? (
                        <div className="text-muted-foreground">
                          uploadElapsedMs: {Math.round(meta.elapsedMs)}ms
                        </div>
                      ) : null}
                      <div className="text-muted-foreground">
                        lastBytesTransferred:{" "}
                        {typeof meta.lastBytesTransferred === "number"
                          ? `${meta.lastBytesTransferred} / ${meta.lastTotalBytes ?? "?"}`
                          : "—"}
                      </div>
                      {meta.lastTaskState ? (
                        <div className="text-muted-foreground">
                          lastTaskState: {meta.lastTaskState} · lastProgressAt:{" "}
                          {meta.lastProgressAt
                            ? new Date(meta.lastProgressAt).toLocaleTimeString()
                            : "—"}
                        </div>
                      ) : null}
                      {meta.fullPath ? (
                        <div className="text-muted-foreground">
                          refPath: {meta.fullPath}
                        </div>
                      ) : null}
                      {meta.bucket ? (
                        <div className="text-muted-foreground">
                          bucket: {meta.bucket}
                        </div>
                      ) : null}
                      {meta.pathMismatch ? (
                        <pre className="mt-1 whitespace-pre-wrap text-[11px] text-muted-foreground">
                          {JSON.stringify(meta.pathMismatch, null, 2)}
                        </pre>
                      ) : null}
                      {meta.lastFirebaseError?.message ? (
                        <div className="text-muted-foreground">
                          lastFirebaseError: {meta.lastFirebaseError.code ?? "unknown"} ·{" "}
                          {meta.lastFirebaseError.message}
                        </div>
                      ) : null}
                      {meta.lastUploadError?.message ? (
                        <div className="text-muted-foreground">
                          lastUploadError: {meta.lastUploadError.code ?? "unknown"} ·{" "}
                          {meta.lastUploadError.message}
                        </div>
                      ) : null}
                      {meta.lastUploadError?.details ? (
                        <pre className="mt-1 whitespace-pre-wrap text-[11px] text-muted-foreground">
                          {JSON.stringify(meta.lastUploadError.details, null, 2)}
                        </pre>
                      ) : null}
                      {meta.lastFirebaseError?.serverResponse ? (
                        <pre className="mt-1 whitespace-pre-wrap text-[11px] text-muted-foreground">
                          {meta.lastFirebaseError.serverResponse}
                        </pre>
                      ) : null}
                      {meta.lastError?.message ? (
                        <div className="text-muted-foreground">
                          lastPoseError: {meta.lastError.message}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          </details>
        ) : null}
      </form>
    </div>
  );
}
