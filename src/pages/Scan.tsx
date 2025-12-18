/**
 * Pipeline map — Scan upload & status:
 * - Collects 4 photos + weight inputs, converting to kg via `useUnits`.
 * - Calls `startScanSessionClient` to reserve Firestore `users/{uid}/scans/{scanId}` with `status: "pending"`.
 * - Streams uploads through `submitScanClient` so progress callbacks update local UI and progress bar.
 * - Navigates to `/scans/{id}` once uploads finish, while `ScanResult` polls Firestore for `processing`→`complete`.
 * - On errors, surfaces actionable toasts and uses `deleteScanApi` to clean up orphaned scan docs/storage objects.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  deleteScanApi,
  startScanSessionClient,
  submitScanClient,
  type ScanUploadProgress,
} from "@/lib/api/scan";
import { useAuthUser } from "@/lib/useAuthUser";
import { useUnits } from "@/hooks/useUnits";
import { lbToKg } from "@/lib/units";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { computeFeatureStatuses } from "@/lib/envStatus";
import { useSystemHealth } from "@/hooks/useSystemHealth";
import { toast } from "@/hooks/use-toast";
import { toProgressBarWidth, toVisiblePercent } from "@/lib/progress";

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
  } | null>(null);
  type Pose = "front" | "back" | "left" | "right";
  type PerPhotoStatus = "preparing" | "uploading" | "retrying" | "done" | "failed";
  type FileMeta = { name: string; size: number; type: string };
  const [photoState, setPhotoState] = useState<
    Record<
      Pose,
      { status: PerPhotoStatus; percent: number; attempt: number; message?: string }
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
  const [photoMeta, setPhotoMeta] = useState<
    Record<
      Pose,
      {
        original?: FileMeta;
        compressed?: FileMeta;
        preprocessDebug?: unknown;
        lastError?: { code?: string; message?: string };
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
  const { health: systemHealth } = useSystemHealth();
  const { scanConfigured } = computeFeatureStatuses(systemHealth ?? undefined);
  const openaiMissing =
    systemHealth?.openaiConfigured === false ||
    systemHealth?.openaiKeyPresent === false;

  useEffect(() => {
    if (!authLoading && !user) nav("/auth?next=/scan");
  }, [authLoading, user, nav]);

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
    } else if (status === "submitting" || status === "processing") {
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
      setStatus("starting");
      setFailureReason(null);
      setStatusDetail("Verifying credits and reserving secure compute…");
      const start = await startScanSessionClient({
        currentWeightKg,
        goalWeightKg,
      });
      if (!start.ok) {
        const debugSuffix = start.error.debugId
          ? ` (ref ${start.error.debugId.slice(0, 8)})`
          : "";
        failFlow(start.error.message + debugSuffix);
        return;
      }

      const startedScanId = start.data.scanId;
      sessionFinalizedRef.current = false;
      sessionScanId = startedScanId;
      setActiveScanId(startedScanId);
      setScanSession({
        scanId: startedScanId,
        storagePaths: start.data.storagePaths,
        currentWeightKg,
        goalWeightKg,
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
        },
        {
          onUploadProgress: (info: ScanUploadProgress) => {
            const filePercent = toVisiblePercent(info.percent);
            const overallPercent = toVisiblePercent(info.overallPercent);
            setUploadProgress(info.overallPercent);
            setUploadPose(info.pose);
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
            }
          },
          signal: abortController.signal,
          stallTimeoutMs: 15_000,
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

      setUploadProgress(null);
      setUploadPose(null);
      setUploadHasBytes(false);
      setStatus("processing");
      setStatusDetail(
        "Processing started. We’re analyzing posture, estimating body fat, and generating your plan…"
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
    }
  }, [cleanupPendingScan, scanSession?.scanId]);

  const retryFailed = useCallback(async () => {
    if (!scanSession) return;
    if (!canRetryFailed) return;
    setError(null);
    setLastUploadError(null);
    setStatus("uploading");
    setStatusDetail("Retrying failed photo uploads…");
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
        },
        signal: abortController.signal,
        stallTimeoutMs: 15_000,
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
    setStatus("processing");
    setStatusDetail(
      "Processing started. We’re analyzing posture, estimating body fat, and generating your plan…"
    );
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
  ]);

  const retrySubmitOnly = useCallback(async () => {
    if (!scanSession) return;
    if (!canRetrySubmit) return;
    setError(null);
    setFailureReason(null);
    setLastUploadError(null);
    setStatus("submitting");
    setStatusDetail("Retrying analysis…");
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
      },
      {
        posesToUpload: [],
        signal: abortController.signal,
        stallTimeoutMs: 15_000,
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
    setStatus("processing");
    setStatusDetail(
      "Processing started. We’re analyzing posture, estimating body fat, and generating your plan…"
    );
    nav(`/scans/${scanSession.scanId}`);
  }, [canRetrySubmit, failFlow, nav, photos, scanSession]);

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
          },
          signal: abortController.signal,
          stallTimeoutMs: 15_000,
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
      setStatus("processing");
      setStatusDetail(
        "Processing started. We’re analyzing posture, estimating body fat, and generating your plan…"
      );
      nav(`/scans/${scanSession.scanId}`);
    },
    [failFlow, nav, photos, scanSession]
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

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4">
      <h1 className="text-xl font-semibold">AI Body Scan</h1>
      <p className="text-sm text-muted-foreground">
        Upload four photos and your current/goal weight. We&apos;ll analyze your
        body composition and build a personalized workout and nutrition plan.
      </p>

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
                        Compressed: {photoMeta[pose as Pose].compressed!.name} ·{" "}
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
          className="w-full rounded-md bg-black px-4 py-2 text-white disabled:opacity-50"
        >
          {status === "starting" && "Starting scan…"}
          {status === "preparing" && "Preparing photos…"}
          {status === "uploading" && "Uploading photos…"}
          {status === "submitting" && "Starting analysis…"}
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
          status === "processing" ||
          status === "error") && (
          <div className="space-y-2">
            {delayNotice && <p className="text-xs text-amber-600">{delayNotice}</p>}
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
                return (
                  <div key={pose} className="rounded border p-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium">{label}</span>
                      <span className="text-muted-foreground">
                        {s.status}
                        {s.attempt ? ` (attempt ${s.attempt})` : ""}
                        {s.status === "uploading" || s.status === "retrying" ? ` · ${pct}%` : ""}
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

        {import.meta.env.DEV ? (
          <details className="rounded border p-3 text-xs">
            <summary className="cursor-pointer select-none font-medium">
              Upload debug
            </summary>
            <div className="mt-2 space-y-2">
              <div>
                <span className="font-medium">uid:</span>{" "}
                <span className="text-muted-foreground">{user?.uid ?? "—"}</span>
              </div>
              <div>
                <span className="font-medium">scanId:</span>{" "}
                <span className="text-muted-foreground">
                  {scanSession?.scanId ?? activeScanId ?? "—"}
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
              <div className="space-y-2">
                {(["front", "back", "left", "right"] as Pose[]).map((pose) => {
                  const meta = photoMeta[pose];
                  const state = photoState[pose];
                  return (
                    <div key={pose} className="rounded border p-2">
                      <div className="font-medium">{pose}</div>
                      <div className="text-muted-foreground">
                        state: {state.status} · attempt {state.attempt || 0}
                      </div>
                      <div className="text-muted-foreground">
                        original:{" "}
                        {meta.original
                          ? `${meta.original.size} bytes · ${meta.original.type} · ${meta.original.name}`
                          : "—"}
                      </div>
                      <div className="text-muted-foreground">
                        compressed:{" "}
                        {meta.compressed
                          ? `${meta.compressed.size} bytes · ${meta.compressed.type} · ${meta.compressed.name}`
                          : "—"}
                      </div>
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
