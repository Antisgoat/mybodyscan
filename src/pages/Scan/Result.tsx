import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ReferenceChart } from "@/components/ReferenceChart";
import { Seo } from "@/components/Seo";
import { useUserProfile } from "@/hooks/useUserProfile";
import { estimateBodyComp } from "@/lib/estimator";
import type { ViewName, PhotoFeatures } from "@/lib/vision/features";
import { combineLandmarks } from "@/lib/vision/features";
import type { Landmarks } from "@/lib/vision/landmarks";
import { analyzePhoto } from "@/lib/vision/landmarks";
import { cmToIn, kgToLb, lbToKg, CM_PER_IN } from "@/lib/units";
import { getLastWeight } from "@/lib/userState";
import {
  findRangeForValue,
  getSexAgeBands,
  type LabeledRange,
} from "@/content/referenceRanges";
import {
  createScanCorrelationId,
  deleteScanApi,
  startScanSessionClient,
  submitScanClient,
  type ScanUploadProgress,
} from "@/lib/api/scan";
import { uploadViaHttp } from "@/lib/uploads/uploadViaHttp";
import type { UploadMethod } from "@/lib/uploads/uploadPhoto";
import { auth, getFirebaseApp, getFirebaseConfig, getFirebaseStorage } from "@/lib/firebase";
import {
  CAPTURE_VIEW_SETS,
  type CaptureView,
  resetCaptureFlow,
  setCaptureSession,
  useScanCaptureStore,
} from "./scanCaptureStore";
import { RefineMeasurementsForm } from "./Refine";
import { setPhotoCircumferences, useScanRefineStore } from "./scanRefineStore";
import type { ManualCircumferences } from "./scanRefineStore";
import { useAppCheckStatus } from "@/hooks/useAppCheckStatus";
import { useUnits } from "@/hooks/useUnits";
import { useSystemHealth } from "@/hooks/useSystemHealth";
import { computeFeatureStatuses } from "@/lib/envStatus";
import { toast } from "@/hooks/use-toast";
import { POSES, type Pose } from "@/features/scan/poses";
import { toProgressBarWidth, toVisiblePercent } from "@/lib/progress";
import { useAuthUser } from "@/lib/useAuthUser";

const VIEW_NAME_MAP: Record<CaptureView, ViewName> = {
  Front: "front",
  Side: "side",
  Back: "back",
  Left: "left",
  Right: "right",
};

const VIEW_TO_POSE: Partial<Record<CaptureView, Pose>> = {
  Front: "front",
  Back: "back",
  Left: "left",
  Right: "right",
};

type FlowStatus =
  | "idle"
  | "starting"
  | "uploading"
  | "queued"
  | "processing"
  | "error";

type PhotoMetadata = {
  name: string;
  size: number;
  type: string;
  lastModified?: number;
};

function formatDecimal(value: number | null | undefined): string | null {
  if (!Number.isFinite(value ?? NaN)) {
    return null;
  }
  const numeric = value as number;
  return numeric.toFixed(1);
}

function formatBytes(bytes: number | null | undefined): string {
  const b = typeof bytes === "number" ? bytes : 0;
  if (!Number.isFinite(b) || b <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(b) / Math.log(1024)));
  const val = b / Math.pow(1024, i);
  return `${val.toFixed(val >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatUploadMethod(method?: UploadMethod): string {
  if (method === "storage") return "sdk";
  if (method === "http") return "function";
  return "—";
}

async function createThumbnailDataUrl(
  file: File,
  maxSize = 128
): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onerror = () => resolve(null);
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => resolve(null);
      image.onload = () => {
        const scale = Math.min(
          maxSize / image.width,
          maxSize / image.height,
          1
        );
        const width = Math.max(1, Math.round(image.width * scale));
        const height = Math.max(1, Math.round(image.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(image, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.6));
      };
      image.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

function toInches(
  value?: number | null,
  scale?: number | null
): number | undefined {
  if (!Number.isFinite(value ?? NaN) || !Number.isFinite(scale ?? NaN)) {
    return undefined;
  }
  if (!value || value <= 0 || !scale || scale <= 0) {
    return undefined;
  }
  return value * (scale as number);
}

function parseManualCircumference(
  value: string,
  units: "us" | "metric"
): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return units === "metric" ? parsed / CM_PER_IN : parsed;
}

export default function ScanFlowResult() {
  const { user, authReady, loading: authLoading } = useAuthUser();
  const { mode, files, weights, session } = useScanCaptureStore();
  const currentWeightKg = weights.currentWeightKg;
  const goalWeightKg = weights.goalWeightKg;
  const { profile } = useUserProfile();
  const [refineOpen, setRefineOpen] = useState(false);
  const { manualInputs, photoCircumferences } = useScanRefineStore();
  const [photoFeatures, setPhotoFeatures] = useState<PhotoFeatures | null>(
    null
  );
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [lastWeight] = useState<number | null>(() => getLastWeight());
  const [thumbnailDataUrl, setThumbnailDataUrl] = useState<string | null>(null);
  const [flowStatus, setFlowStatus] = useState<FlowStatus>("idle");
  const [flowError, setFlowError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploadPose, setUploadPose] = useState<string | null>(null);
  const [uploadHasBytes, setUploadHasBytes] = useState(false);
  const [submittedScanId, setSubmittedScanId] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const showDebug = useMemo(() => {
    if (import.meta.env.DEV) return true;
    try {
      return new URLSearchParams(location.search).get("debug") === "1";
    } catch {
      return false;
    }
  }, [location.search]);

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
  const uploadAbortRef = useRef<AbortController | null>(null);
  const lastAutoRetryAtRef = useRef<number>(0);
  const autoRetryCountRef = useRef<number>(0);
  const appCheck = useAppCheckStatus();
  const { units } = useUnits();
  const { health: systemHealth } = useSystemHealth();
  const { scanConfigured } = computeFeatureStatuses(systemHealth ?? undefined);
  const scanOffline =
    !scanConfigured ||
    systemHealth?.scanConfigured === false ||
    systemHealth?.openaiConfigured === false ||
    systemHealth?.openaiKeyPresent === false;
  const scanOfflineMessage = scanOffline
    ? systemHealth?.openaiConfigured === false ||
      systemHealth?.openaiKeyPresent === false
      ? "Scans require the OpenAI key (OPENAI_API_KEY) to be configured before results can be finalized."
      : "Scan services are offline until the Cloud Functions base URL is configured."
    : null;

  const shots = useMemo(() => CAPTURE_VIEW_SETS[mode], [mode]);
  const capturedShots = useMemo(
    () => shots.filter((view) => Boolean(files[view])),
    [shots, files]
  );
  const allCaptured = capturedShots.length === shots.length;
  const poseFiles = useMemo(() => {
    const map: Partial<Record<Pose, File>> = {};
    for (const [view, file] of Object.entries(files) as Array<
      [CaptureView, File]
    >) {
      const pose = VIEW_TO_POSE[view];
      if (pose && file) {
        map[pose] = file;
      }
    }
    return map;
  }, [files]);
  const poseUploadsReady = POSES.every((pose) => Boolean(poseFiles[pose]));

  type PerPhotoStatus = "preparing" | "uploading" | "retrying" | "done" | "failed";
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
  const failedPoses = useMemo(() => {
    const entries = Object.entries(photoState) as Array<[Pose, (typeof photoState)[Pose]]>;
    return entries.filter(([, s]) => s.status === "failed").map(([pose]) => pose);
  }, [photoState]);
  const canRetryFailed = Boolean(session?.scanId) && failedPoses.length > 0;

  const [uploadMeta, setUploadMeta] = useState<
    Record<
      Pose,
      {
        compressed?: PhotoMetadata;
        preprocessDebug?: unknown;
        lastError?: { code?: string; message?: string };
        lastBytesTransferred?: number;
        lastTotalBytes?: number;
        lastFirebaseError?: { code?: string; message?: string; serverResponse?: string };
        lastTaskState?: "running" | "paused" | "success" | "canceled" | "error";
        lastProgressAt?: number;
        fullPath?: string;
        bucket?: string;
        pathMismatch?: { expected: string; actual: string };
        uploadMethod?: UploadMethod;
        correlationId?: string;
        elapsedMs?: number;
        lastUploadError?: { code?: string; message?: string; details?: unknown };
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

  const tasks = useMemo(
    () =>
      shots
        .map((view) => {
          const file = files[view];
          if (!file) return null;
          return { key: VIEW_NAME_MAP[view], file };
        })
        .filter((entry): entry is { key: ViewName; file: File } =>
          Boolean(entry)
        ),
    [shots, files]
  );

  useEffect(() => {
    let cancelled = false;

    if (!tasks.length || !allCaptured) {
      setPhotoFeatures(null);
      setAnalysisError(null);
      setAnalyzing(false);
      return;
    }

    setAnalyzing(true);
    setAnalysisError(null);

    (async () => {
      try {
        const results = await Promise.all(
          tasks.map(async ({ key, file }) => ({
            key,
            data: await analyzePhoto(file, key),
          }))
        );
        if (cancelled) return;

        const views: Partial<Record<ViewName, Landmarks>> = {};
        for (const result of results) {
          views[result.key] = result.data;
        }
        const combined = combineLandmarks(
          views.front,
          views.side,
          views.left,
          views.right,
          views.back
        );
        setPhotoFeatures(combined);
        setAnalyzing(false);
      } catch (error) {
        console.error("analyzePhoto", error);
        if (cancelled) return;
        setAnalysisError("Could not analyze photos.");
        setPhotoFeatures(null);
        setAnalyzing(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tasks, allCaptured]);

  const readyForSubmission =
    poseUploadsReady &&
    currentWeightKg != null &&
    goalWeightKg != null &&
    !scanOffline;
  const finalizeHelperMessage = !poseUploadsReady
    ? "Capture all four required angles before continuing."
    : currentWeightKg == null || goalWeightKg == null
      ? "Return to Start to confirm your current and goal weight."
      : scanOffline
        ? "Scan services are offline until the backend is configured."
        : "We'll upload your photos securely and notify you when the result is ready.";
  const finalizeDisabled =
    !readyForSubmission ||
    flowStatus === "starting" ||
    flowStatus === "uploading" ||
    flowStatus === "queued" ||
    flowStatus === "processing";

  const handleFinalize = async () => {
    if (!poseUploadsReady || currentWeightKg == null || goalWeightKg == null) {
      setFlowError(
        "Add all photos and confirm your weights before continuing."
      );
      return;
    }
    if (!Number.isFinite(currentWeightKg) || !Number.isFinite(goalWeightKg)) {
      setFlowError("Please confirm valid weights before finalizing.");
      return;
    }
    if (scanOffline) {
      setFlowError("Scan services are offline. Try again later.");
      return;
    }
    if (!user) {
      setFlowStatus("error");
      setFlowError("You must be signed in to upload scans.");
      return;
    }
    setFlowStatus("starting");
    setFlowError(null);
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
    let activeSession = session;
    const scanCorrelationId =
      activeSession?.correlationId ?? createScanCorrelationId();
    let cleanupScanId: string | null = activeSession?.scanId ?? null;
    try {
      if (!activeSession) {
        const start = await startScanSessionClient({
          currentWeightKg,
          goalWeightKg,
          correlationId: scanCorrelationId,
        });
        if (!start.ok) {
          const debugSuffix = start.error.debugId
            ? ` (ref ${start.error.debugId.slice(0, 8)})`
            : "";
          throw new Error(start.error.message + debugSuffix);
        }
        setCaptureSession({
          ...start.data,
          correlationId: scanCorrelationId,
        });
        activeSession = { ...start.data, correlationId: scanCorrelationId };
      }
      if (activeSession && !activeSession.correlationId) {
        activeSession = { ...activeSession, correlationId: scanCorrelationId };
        setCaptureSession(activeSession);
      }
      if (!activeSession) {
        throw new Error("Unable to start scan session.");
      }
      cleanupScanId = activeSession.scanId;
      const photos = {
        front: poseFiles.front!,
        back: poseFiles.back!,
        left: poseFiles.left!,
        right: poseFiles.right!,
      };
      setFlowStatus("uploading");
      uploadAbortRef.current?.abort();
      const abortController = new AbortController();
      uploadAbortRef.current = abortController;
      const submit = await submitScanClient(
        {
          scanId: activeSession.scanId,
          storagePaths: activeSession.storagePaths,
          photos,
          currentWeightKg,
          goalWeightKg,
          scanCorrelationId: activeSession.correlationId,
        },
        {
          onUploadProgress: (info: ScanUploadProgress) => {
            setUploadProgress(info.overallPercent);
            setUploadPose(info.pose);
            if (info.hasBytesTransferred) {
              setUploadHasBytes(true);
            }
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
                uploadMethod: (info as any)?.uploadMethod ?? existing?.uploadMethod,
              };
              return next;
            });
            setUploadMeta((prev) => {
              const next = { ...prev };
              const existing = next[info.pose as Pose] ?? {};
              next[info.pose as Pose] = {
                ...existing,
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
                uploadMethod:
                  (info as any)?.uploadMethod ?? existing.uploadMethod,
                correlationId:
                  (info as any)?.correlationId ?? existing.correlationId,
                elapsedMs:
                  typeof (info as any)?.elapsedMs === "number"
                    ? (info as any).elapsedMs
                    : existing.elapsedMs,
                lastUploadError:
                  (info as any)?.lastUploadError ?? existing.lastUploadError,
                lastError:
                  info.status === "failed"
                    ? { code: undefined, message: info.message }
                    : existing.lastError,
              };
              return next;
            });
          },
          signal: abortController.signal,
          stallTimeoutMs: 15_000,
        }
      );
      uploadAbortRef.current = null;
      if (!submit.ok) {
        const debugSuffix = submit.error.debugId
          ? ` (ref ${submit.error.debugId.slice(0, 8)})`
          : "";
        setLastUploadError({
          code: submit.error.code,
          message: submit.error.message + debugSuffix,
          pose: (submit.error.pose as Pose | undefined) ?? undefined,
        });
        throw new Error(submit.error.message + debugSuffix);
      }
      setFlowStatus("queued");
      setUploadPose(null);
      setUploadHasBytes(false);
      setSubmittedScanId(activeSession.scanId);
      toast({
        title: "Scan uploaded",
        description:
          "We’re queued for processing. This can take a couple of minutes.",
      });
      resetCaptureFlow();
      navigate(`/scan/${activeSession.scanId}`);
    } catch (error: any) {
      setFlowStatus("error");
      setUploadProgress(0);
      setUploadPose(null);
      setUploadHasBytes(false);
      const message =
        typeof error?.message === "string" && error.message.length
          ? error.message
          : "Unable to submit your scan. Please try again.";
      setFlowError(message);
      setLastUploadError({
        code: error?.code,
        message,
        pose: (error?.pose as Pose | undefined) ?? undefined,
      });
      setSubmittedScanId(null);
      toast({
        title: "Unable to submit scan",
        description: message,
        variant: "destructive",
      });
    }
  };

  const cancelScan = useCallback(async () => {
    uploadAbortRef.current?.abort();
    const scanId = session?.scanId ?? null;
    if (scanId) {
      await deleteScanApi(scanId).catch(() => undefined);
    }
    setCaptureSession(null);
    setFlowStatus("idle");
    setFlowError(null);
    setUploadProgress(0);
    setUploadPose(null);
    setUploadHasBytes(false);
    setSubmittedScanId(null);
    setLastUploadError(null);
    autoRetryCountRef.current = 0;
  }, [session?.scanId]);

  const retryFailed = useCallback(async () => {
    if (!session?.scanId || !canRetryFailed) return;
    if (!poseUploadsReady || currentWeightKg == null || goalWeightKg == null) return;
    setFlowStatus("uploading");
    setFlowError(null);
    setLastUploadError(null);
    uploadAbortRef.current?.abort();
    const abortController = new AbortController();
    uploadAbortRef.current = abortController;
    const photos = {
      front: poseFiles.front!,
      back: poseFiles.back!,
      left: poseFiles.left!,
      right: poseFiles.right!,
    };
    const submit = await submitScanClient(
      {
        scanId: session.scanId,
        storagePaths: session.storagePaths,
        photos,
        currentWeightKg,
        goalWeightKg,
        scanCorrelationId: session.correlationId,
      },
      {
        posesToUpload: failedPoses,
        onUploadProgress: (info: ScanUploadProgress) => {
          setUploadProgress(info.overallPercent);
          setUploadPose(info.pose);
          if (info.hasBytesTransferred) setUploadHasBytes(true);
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
                uploadMethod: (info as any)?.uploadMethod ?? existing?.uploadMethod,
              };
              return next;
            });
          setUploadMeta((prev) => {
            const next = { ...prev };
            const existing = next[info.pose as Pose] ?? {};
            next[info.pose as Pose] = {
              ...existing,
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
                pathMismatch:
                  (info as any)?.pathMismatch ?? existing.pathMismatch,
                uploadMethod:
                  (info as any)?.uploadMethod ?? existing.uploadMethod,
                correlationId:
                  (info as any)?.correlationId ?? existing.correlationId,
                elapsedMs:
                  typeof (info as any)?.elapsedMs === "number"
                    ? (info as any).elapsedMs
                    : existing.elapsedMs,
                lastUploadError:
                  (info as any)?.lastUploadError ?? existing.lastUploadError,
                lastError:
                  info.status === "failed"
                    ? { code: undefined, message: info.message }
                    : existing.lastError,
            };
            return next;
          });
        },
        signal: abortController.signal,
        stallTimeoutMs: 15_000,
      }
    );
    uploadAbortRef.current = null;
    if (!submit.ok) {
      setFlowStatus("error");
      setFlowError(submit.error.message);
      setLastUploadError({
        code: submit.error.code,
        message: submit.error.message,
        pose: (submit.error.pose as Pose | undefined) ?? undefined,
      });
      return;
    }
    setFlowStatus("queued");
    navigate(`/scan/${session.scanId}`);
  }, [
    canRetryFailed,
    currentWeightKg,
    failedPoses,
    goalWeightKg,
    navigate,
    poseFiles.back,
    poseFiles.front,
    poseFiles.left,
    poseFiles.right,
    poseUploadsReady,
    session?.scanId,
    session?.storagePaths,
  ]);

  const retryPose = useCallback(
    async (pose: Pose) => {
      if (!session?.scanId) return;
      if (!poseUploadsReady || currentWeightKg == null || goalWeightKg == null) return;
      setFlowStatus("uploading");
      setFlowError(null);
      setLastUploadError(null);
      uploadAbortRef.current?.abort();
      const abortController = new AbortController();
      uploadAbortRef.current = abortController;
      const photos = {
        front: poseFiles.front!,
        back: poseFiles.back!,
        left: poseFiles.left!,
        right: poseFiles.right!,
      };
      const submit = await submitScanClient(
        {
          scanId: session.scanId,
          storagePaths: session.storagePaths,
          photos,
          currentWeightKg,
          goalWeightKg,
          scanCorrelationId: session.correlationId,
        },
        {
          posesToUpload: [pose],
          onUploadProgress: (info: ScanUploadProgress) => {
            setUploadProgress(info.overallPercent);
            setUploadPose(info.pose);
            if (info.hasBytesTransferred) setUploadHasBytes(true);
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
                uploadMethod: (info as any)?.uploadMethod ?? existing?.uploadMethod,
              };
              return next;
            });
            setUploadMeta((prev) => {
              const next = { ...prev };
              const existing = next[info.pose as Pose] ?? {};
              next[info.pose as Pose] = {
                ...existing,
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
                pathMismatch:
                  (info as any)?.pathMismatch ?? existing.pathMismatch,
                uploadMethod:
                  (info as any)?.uploadMethod ?? existing.uploadMethod,
                correlationId:
                  (info as any)?.correlationId ?? existing.correlationId,
                elapsedMs:
                  typeof (info as any)?.elapsedMs === "number"
                    ? (info as any).elapsedMs
                    : existing.elapsedMs,
                lastUploadError:
                  (info as any)?.lastUploadError ?? existing.lastUploadError,
                lastError:
                  info.status === "failed"
                    ? { code: undefined, message: info.message }
                    : existing.lastError,
              };
              return next;
            });
          },
          signal: abortController.signal,
          stallTimeoutMs: 15_000,
        }
      );
      uploadAbortRef.current = null;
      if (!submit.ok) {
        setFlowStatus("error");
        setFlowError(submit.error.message);
        setLastUploadError({
          code: submit.error.code,
          message: submit.error.message,
          pose: (submit.error.pose as Pose | undefined) ?? undefined,
        });
        return;
      }
      setFlowStatus("queued");
      navigate(`/scan/${session.scanId}`);
    },
    [
      currentWeightKg,
      goalWeightKg,
      navigate,
      poseFiles.back,
      poseFiles.front,
      poseFiles.left,
      poseFiles.right,
      poseUploadsReady,
      session?.scanId,
      session?.storagePaths,
    ]
  );

  useEffect(() => {
    const maybeAutoRetry = () => {
      if (!canRetryFailed) return;
      if (flowStatus !== "error") return;
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      const now = Date.now();
      if (now - lastAutoRetryAtRef.current < 15_000) return;
      if (autoRetryCountRef.current >= 2) return;
      lastAutoRetryAtRef.current = now;
      autoRetryCountRef.current += 1;
      void retryFailed();
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
  }, [canRetryFailed, flowStatus, retryFailed]);

  const sex =
    profile?.sex === "male" || profile?.sex === "female"
      ? profile.sex
      : undefined;
  const age =
    profile?.age && Number.isFinite(profile.age) ? profile.age : undefined;
  const heightIn = profile?.height_cm ? cmToIn(profile.height_cm) : undefined;
  const profileWeightLb = profile?.weight_kg
    ? kgToLb(profile.weight_kg)
    : undefined;
  const weightLb = lastWeight ?? profileWeightLb ?? undefined;

  useEffect(() => {
    if (!photoFeatures || !heightIn) {
      setPhotoCircumferences(null);
      return;
    }

    const averages = photoFeatures.averages;
    const heightPixels = averages?.heightPixels;
    if (
      !Number.isFinite(heightPixels ?? NaN) ||
      (heightPixels as number) <= 0
    ) {
      setPhotoCircumferences(null);
      return;
    }

    const scale = heightIn / (heightPixels as number);
    const neckIn = toInches(averages?.neckWidth, scale);
    const waistIn = toInches(averages?.waistWidth, scale);
    const hipIn = toInches(averages?.hipWidth, scale);
    setPhotoCircumferences({ neckIn, waistIn, hipIn });
  }, [photoFeatures, heightIn]);

  const manualCircumferences = useMemo<ManualCircumferences | null>(() => {
    const neckIn = parseManualCircumference(manualInputs.neck, units);
    const waistIn = parseManualCircumference(manualInputs.waist, units);
    const hipIn = parseManualCircumference(manualInputs.hip, units);
    if (neckIn == null && waistIn == null && hipIn == null) {
      return null;
    }
    return { neckIn, waistIn, hipIn };
  }, [manualInputs, units]);

  const primaryFile = useMemo(() => {
    const firstCaptured = capturedShots[0];
    if (!firstCaptured) return null;
    return files[firstCaptured] ?? null;
  }, [capturedShots, files]);

  useEffect(() => {
    let cancelled = false;
    if (!primaryFile) {
      setThumbnailDataUrl(null);
      return;
    }
    createThumbnailDataUrl(primaryFile).then((dataUrl) => {
      if (cancelled) return;
      setThumbnailDataUrl(dataUrl);
    });
    return () => {
      cancelled = true;
    };
  }, [primaryFile]);

  const photoMetadata = useMemo(() => {
    const meta: Partial<Record<ViewName, PhotoMetadata>> = {};
    for (const view of capturedShots) {
      const file = files[view];
      if (!file) continue;
      const key = VIEW_NAME_MAP[view];
      const entry: PhotoMetadata = {
        name: file.name,
        size: file.size,
        type: file.type || "image/jpeg",
      };
      if (typeof file.lastModified === "number") {
        entry.lastModified = file.lastModified;
      }
      meta[key] = entry;
    }
    return meta;
  }, [capturedShots, files]);

  const estimate = useMemo(() => {
    if (!photoFeatures) return null;
    if (!heightIn || !sex) return null;
    return estimateBodyComp({
      sex,
      age,
      heightIn,
      weightLb: weightLb ?? undefined,
      photoFeatures,
      manualCircumferences: manualCircumferences ?? undefined,
    });
  }, [age, heightIn, manualCircumferences, photoFeatures, sex, weightLb]);

  const bodyFatValue = formatDecimal(estimate?.bodyFatPct ?? null);
  const bodyFatPctNumber = Number.isFinite(estimate?.bodyFatPct ?? NaN)
    ? (estimate?.bodyFatPct as number)
    : null;
  const referenceRanges = useMemo<LabeledRange[]>(() => {
    if (!sex || age == null) return [];
    return getSexAgeBands(sex, age);
  }, [age, sex]);
  const ageBandLabel = referenceRanges[0]?.band ?? null;
  const currentReferenceRange =
    bodyFatPctNumber != null
      ? findRangeForValue(referenceRanges, bodyFatPctNumber)
      : null;
  const sexLabel = sex ? `${sex.charAt(0).toUpperCase()}${sex.slice(1)}` : null;
  const rangeLabel = currentReferenceRange?.label ?? null;
  const percentText =
    bodyFatPctNumber != null ? bodyFatPctNumber.toFixed(1) : null;
  const referenceContextText =
    sexLabel && ageBandLabel && percentText && rangeLabel
      ? `For ${sexLabel} age ${ageBandLabel}, ${percentText}% places you in the ${rangeLabel} range.`
      : null;
  const bmiValue = formatDecimal(estimate?.bmi ?? null);
  const weightValue = useMemo(() => {
    const weight = estimate?.usedWeight ?? weightLb ?? null;
    if (!Number.isFinite(weight ?? NaN)) return null;
    return units === "metric"
      ? `${lbToKg(weight as number).toFixed(1)}`
      : `${formatDecimal(weight)}`;
  }, [estimate?.usedWeight, weightLb, units]);

  const photoEstimatePayload = useMemo(
    () => ({
      neck: photoCircumferences?.neckIn ?? null,
      waist: photoCircumferences?.waistIn ?? null,
      hip: photoCircumferences?.hipIn ?? null,
    }),
    [photoCircumferences]
  );

  const userCircumPayload = useMemo(
    () => ({
      neck: manualCircumferences?.neckIn ?? null,
      waist: manualCircumferences?.waistIn ?? null,
      hip: manualCircumferences?.hipIn ?? null,
    }),
    [manualCircumferences]
  );

  const bmiNumber = useMemo(() => {
    const value = estimate?.bmi;
    if (!Number.isFinite(value ?? NaN)) return null;
    return Number((value as number).toFixed(1));
  }, [estimate]);

  const usedWeightLb = useMemo(() => {
    const raw = estimate?.usedWeight ?? weightLb ?? null;
    if (!Number.isFinite(raw ?? NaN)) return null;
    return Number((raw as number).toFixed(1));
  }, [estimate, weightLb]);

  const heightInValue = useMemo(() => {
    if (!Number.isFinite(heightIn ?? NaN)) return null;
    return Number(heightIn);
  }, [heightIn]);

  const estimateStatus = useMemo(() => {
    if (analysisError) return analysisError;
    if (analyzing) return "Analyzing photos…";
    if (flowStatus === "starting") return "Preparing secure upload…";
    if (flowStatus === "uploading") {
      const progressPct = toVisiblePercent(uploadProgress);
      return uploadPose
        ? `Uploading ${uploadPose} photo (${progressPct}% complete)…`
        : "Uploading encrypted photos…";
    }
    if (flowStatus === "queued")
      return "Photos uploaded. Queued for processing…";
    if (flowStatus === "processing")
      return "Photos uploaded. Processing your scan…";
    if (flowError) return flowError;
    if (submittedScanId) return "Scan uploaded. Opening your result…";
    if (!allCaptured)
      return "Capture every required angle to analyze the scan.";
    if (!heightIn || !sex)
      return "Add your height and sex in Settings to unlock the preview.";
    if (!bodyFatValue) return "Add your weight to see the full estimate.";
    return "Scan preview based on your latest photos.";
  }, [
    analysisError,
    analyzing,
    allCaptured,
    heightIn,
    sex,
    bodyFatValue,
    flowStatus,
    flowError,
    uploadProgress,
    uploadPose,
    submittedScanId,
  ]);

  return (
    <div className="space-y-6">
      <Seo
        title="Scan Result Preview – MyBodyScan"
        description="Review the draft estimate before finalizing."
      />
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold">Preview Result</h1>
        <p className="text-muted-foreground">{estimateStatus}</p>
      </div>
      {appCheck.status === "checking" ? (
        <Alert className="border-dashed">
          <AlertTitle>Checking secure access…</AlertTitle>
          <AlertDescription>
            App Check is initializing (optional). You can still finalize your
            scan if everything else is ready.
          </AlertDescription>
        </Alert>
      ) : null}
      {scanOfflineMessage ? (
        <Alert variant="destructive">
          <AlertTitle>Scan services offline</AlertTitle>
          <AlertDescription>{scanOfflineMessage}</AlertDescription>
        </Alert>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Estimated body metrics</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3 rounded-lg border p-4">
            <div>
              <p className="text-sm text-muted-foreground">
                Estimated Body Fat
              </p>
              <p className="text-3xl font-semibold">
                {bodyFatValue ? `${bodyFatValue}%` : "—"}
              </p>
            </div>
            <p className="text-sm">
              Estimated BMI: {bmiValue ?? "—"} · Weight:{" "}
              {weightValue
                ? `${weightValue} ${units === "metric" ? "kg" : "lb"}`
                : "—"}
            </p>
            <p className="text-xs text-muted-foreground">
              Estimates only. Not a medical diagnosis.
            </p>
            {referenceContextText ? (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  {referenceContextText}
                </p>
                <ReferenceChart sex={sex} age={age} bfPct={bodyFatPctNumber} />
              </div>
            ) : null}
            <Dialog open={refineOpen} onOpenChange={setRefineOpen}>
              <DialogTrigger asChild>
                <button
                  type="button"
                  className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                >
                  Refine measurements
                </button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Refine estimate</DialogTitle>
                  <DialogDescription>
                    Enter manual measurements to update the result preview.
                  </DialogDescription>
                </DialogHeader>
                <RefineMeasurementsForm
                  onSubmit={() => setRefineOpen(false)}
                  footer={
                    <DialogFooter>
                      <Button type="submit">Close</Button>
                    </DialogFooter>
                  }
                />
              </DialogContent>
            </Dialog>
          </div>

          <div className="space-y-2">
            <h2 className="text-lg font-medium">Captured photos</h2>
            <ul className="space-y-2">
              {shots.map((view) => {
                const file = files[view];
                const pose = VIEW_TO_POSE[view];
                const compressed = pose ? uploadMeta[pose]?.compressed : undefined;
                return (
                  <li
                    key={view}
                    className="flex items-center justify-between rounded-md border p-3"
                  >
                    <span className="font-medium">{view}</span>
                    {file ? (
                      <span className="text-sm text-muted-foreground">
                        <span className="block text-right">
                          Original: {file.name} · {formatBytes(file.size)} ·{" "}
                          {(file.type || "image/*").toUpperCase()}
                        </span>
                        {compressed ? (
                          <span className="block text-right">
                            Prepared: {compressed.name} ·{" "}
                            {formatBytes(compressed.size)} ·{" "}
                            {compressed.type.toUpperCase()}
                          </span>
                        ) : null}
                      </span>
                    ) : (
                      <span className="text-sm text-destructive">Missing</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </CardContent>
      </Card>
      <Card className="border border-dashed bg-muted/40">
        <CardHeader>
          <CardTitle>Finalize scan</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {finalizeHelperMessage}
          </p>
          {flowError ? (
            <p className="text-sm text-destructive">{flowError}</p>
          ) : null}
          {isOffline && flowStatus === "uploading" ? (
            <p className="text-xs text-amber-700" aria-live="polite">
              Connection lost — we’ll retry automatically when you’re back online.
            </p>
          ) : null}
          {flowStatus === "uploading" ? (
            <div className="space-y-1">
              <div className="h-2 w-full rounded-full bg-secondary">
                <div
                  className={
                    uploadHasBytes
                      ? "h-2 rounded-full bg-primary transition-all"
                      : "h-2 rounded-full bg-primary/60 animate-pulse"
                  }
                  style={{
                    width: uploadHasBytes
                      ? `${toProgressBarWidth(uploadProgress)}%`
                      : "30%",
                  }}
                />
              </div>
              {uploadPose ? (
                <p className="text-xs text-muted-foreground">
                  {uploadHasBytes
                    ? `Uploading ${uploadPose} (${toVisiblePercent(uploadProgress)}%)`
                    : `Uploading ${uploadPose} (progress pending)`}
                </p>
              ) : null}
            </div>
          ) : null}
          {flowStatus === "uploading" || flowStatus === "queued" || flowStatus === "error" ? (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={cancelScan}
              >
                Cancel scan
              </Button>
              {canRetryFailed ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={retryFailed}
                >
                  Retry failed photo(s)
                </Button>
              ) : null}
              {failedPoses.length ? (
                <>
                  {failedPoses.map((pose) => (
                    <Button
                      key={pose}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void retryPose(pose)}
                    >
                      Retry {pose} upload
                    </Button>
                  ))}
                </>
              ) : null}
            </div>
          ) : null}
          {flowStatus === "uploading" || flowStatus === "error" ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Photo upload status</p>
              <div className="space-y-2">
                {POSES.map((pose) => {
                  const s = photoState[pose];
                  const pct = Math.max(0, Math.min(100, Math.round((s?.percent ?? 0) * 100)));
                  const label = pose.charAt(0).toUpperCase() + pose.slice(1);
                  const retryInMs =
                    s.status === "retrying" && typeof s.nextRetryAt === "number"
                      ? Math.max(0, s.nextRetryAt - nowMs)
                      : null;
                  return (
                    <div key={pose} className="rounded-md border p-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium">{label}</span>
                        <span className="text-muted-foreground">
                          {s.status}
                          {s.attempt ? ` (attempt ${s.attempt})` : ""}
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
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={handleFinalize}
              disabled={finalizeDisabled}
            >
              {flowStatus === "uploading"
                ? "Uploading…"
                : flowStatus === "queued"
                  ? "Queued…"
                  : flowStatus === "processing"
                    ? "Processing…"
                  : flowStatus === "starting"
                    ? "Preparing…"
                    : "Finalize with AI"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate("/scan/capture")}
            >
              Retake photos
            </Button>
          </div>
        </CardContent>
      </Card>
      {showDebug ? (
        <details className="rounded border p-3 text-xs">
          <summary className="cursor-pointer select-none font-medium">
            Debug details
          </summary>
          <div className="mt-2 space-y-2">
            <div>
              <span className="font-medium">firebase:</span>
              <pre className="mt-1 whitespace-pre-wrap text-[11px] text-muted-foreground">
                {(() => {
                  const cfg = getFirebaseConfig();
                  const appBucket = String(getFirebaseApp().options?.storageBucket || "");
                  const bucketFromStorage = String(
                    getFirebaseStorage().app?.options?.storageBucket || ""
                  );
                  return JSON.stringify(
                    {
                      projectId: cfg?.projectId,
                      authDomain: cfg?.authDomain,
                      storageBucket: cfg?.storageBucket,
                      storageBucketApp: appBucket || null,
                      storageBucketResolved: bucketFromStorage || null,
                    },
                    null,
                    2
                  );
                })()}
              </pre>
            </div>
            <div>
              <span className="font-medium">device:</span>{" "}
              <span className="text-muted-foreground">
                {(() => {
                  const anyDebug =
                    (uploadMeta.front.preprocessDebug as any)?.device ??
                    (uploadMeta.back.preprocessDebug as any)?.device ??
                    (uploadMeta.left.preprocessDebug as any)?.device ??
                    (uploadMeta.right.preprocessDebug as any)?.device ??
                    null;
                  if (!anyDebug) return "—";
                  const mode = anyDebug.isMobileUploadDevice ? "mobile" : "desktop";
                  const safari = anyDebug.isProbablyMobileSafari ? " (iOS Safari)" : "";
                  return `${mode}${safari}`;
                })()}
              </span>
            </div>
            <div>
              <span className="font-medium">auth:</span>{" "}
              <span className="text-muted-foreground">
                authReady={authReady ? "true" : "false"} · loading=
                {authLoading ? "true" : "false"} · uid={user?.uid ?? "—"}
              </span>
            </div>
            <div>
              <span className="font-medium">app check:</span>{" "}
              <span className="text-muted-foreground">
                {appCheck.status} · tokenPresent={appCheck.tokenPresent ? "true" : "false"}
                {appCheck.message ? ` · ${appCheck.message}` : ""}
              </span>
            </div>
            <div>
              <span className="font-medium">scanId:</span>{" "}
              <span className="text-muted-foreground">{session?.scanId ?? "—"}</span>
            </div>
            <div>
              <span className="font-medium">storage path(s):</span>
              <pre className="mt-1 whitespace-pre-wrap text-[11px] text-muted-foreground">
                {session?.storagePaths
                  ? JSON.stringify(session.storagePaths, null, 2)
                  : "—"}
              </pre>
            </div>
            <div>
              <span className="font-medium">last error:</span>{" "}
              <span className="text-muted-foreground">
                {lastUploadError
                  ? `${lastUploadError.code ?? "unknown"} · ${lastUploadError.message ?? ""}${
                      lastUploadError.pose ? ` · pose=${lastUploadError.pose}` : ""
                    }`
                  : "—"}
              </span>
            </div>
            <div className="space-y-2">
              {POSES.map((pose) => {
                const state = photoState[pose];
                const original = photoMetadata[pose];
                const compressed = uploadMeta[pose]?.compressed;
                return (
                  <div key={pose} className="rounded border p-2">
                    <div className="font-medium">{pose}</div>
                    <div className="text-muted-foreground">
                      state: {state.status} · attempt {state.attempt || 0} · method{" "}
                      {formatUploadMethod(state.uploadMethod)}
                    </div>
                    <div className="text-muted-foreground">
                      original:{" "}
                      {original
                        ? `${formatBytes(original.size)} · ${original.type} · ${original.name}`
                        : "—"}
                    </div>
                    <div className="text-muted-foreground">
                      prepared:{" "}
                      {compressed
                        ? `${formatBytes(compressed.size)} · ${compressed.type} · ${compressed.name}`
                        : "—"}
                    </div>
                    <div className="text-muted-foreground">
                      object path:{" "}
                      {uploadMeta[pose]?.fullPath ?? session?.storagePaths?.[pose] ?? "—"}
                    </div>
                    {uploadMeta[pose]?.uploadMethod ? (
                      <div className="text-muted-foreground">
                        methodUsed: {formatUploadMethod(uploadMeta[pose]!.uploadMethod)}
                      </div>
                    ) : null}
                    {uploadMeta[pose]?.bucket ? (
                      <div className="text-muted-foreground">
                        bucket: {uploadMeta[pose]!.bucket}
                      </div>
                    ) : null}
                    {uploadMeta[pose]?.pathMismatch ? (
                      <pre className="mt-1 whitespace-pre-wrap text-[11px] text-muted-foreground">
                        {JSON.stringify(uploadMeta[pose]!.pathMismatch, null, 2)}
                      </pre>
                    ) : null}
                    <div className="text-muted-foreground">
                      lastBytesTransferred:{" "}
                      {typeof uploadMeta[pose]?.lastBytesTransferred === "number"
                        ? `${uploadMeta[pose]!.lastBytesTransferred} / ${uploadMeta[pose]!.lastTotalBytes ?? "?"}`
                        : "—"}
                    </div>
                    {uploadMeta[pose]?.lastTaskState ? (
                      <div className="text-muted-foreground">
                        taskState: {uploadMeta[pose]!.lastTaskState} · lastProgressAt:{" "}
                        {uploadMeta[pose]!.lastProgressAt
                          ? new Date(uploadMeta[pose]!.lastProgressAt!).toLocaleTimeString()
                          : "—"}
                      </div>
                    ) : null}
                    {uploadMeta[pose]?.lastFirebaseError?.message ? (
                      <div className="text-muted-foreground">
                        lastFirebaseError: {uploadMeta[pose]!.lastFirebaseError!.code ?? "unknown"} ·{" "}
                        {uploadMeta[pose]!.lastFirebaseError!.message}
                      </div>
                    ) : null}
                    {uploadMeta[pose]?.lastUploadError?.message ? (
                      <div className="text-muted-foreground">
                        lastUploadError: {uploadMeta[pose]!.lastUploadError!.code ?? "unknown"} ·{" "}
                        {uploadMeta[pose]!.lastUploadError!.message}
                      </div>
                    ) : null}
                    {uploadMeta[pose]?.lastFirebaseError?.serverResponse ? (
                      <pre className="mt-1 whitespace-pre-wrap text-[11px] text-muted-foreground">
                        {uploadMeta[pose]!.lastFirebaseError!.serverResponse}
                      </pre>
                    ) : null}
                    {state.message ? (
                      <div className="text-muted-foreground">
                        lastPoseMessage: {state.message}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </details>
      ) : null}
      {submittedScanId ? (
        <Card className="border border-dashed">
          <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium">Scan submitted</p>
              <p className="text-sm text-muted-foreground">
                We’re queued for processing now. You can review it in your
                history at any time.
              </p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link to="/scan/history">View history</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
