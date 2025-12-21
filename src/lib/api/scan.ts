/**
 * Pipeline map — Client scan API bridge:
 * - Starts scan sessions (`startScanSessionClient`) so Firestore creates a pending doc + storage paths.
 * - Streams uploads via Firebase Storage, emitting `ScanUploadProgress` so the UI can avoid 0% stalls.
 * - Submits metadata to the HTTPS function, handles cleanup (`deleteScanApi`), and fetches Firestore results.
 */
import { apiFetch, ApiError } from "@/lib/http";
import { resolveFunctionUrl } from "@/lib/api/functionsBase";
import { auth, db, storage } from "@/lib/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { buildScanPhotoPath, type ScanPose } from "@/lib/scanPaths";
import {
  prepareScanPhoto,
  type UploadPreprocessMeta,
  type UploadPreprocessResult,
} from "@/features/scan/resizeImage";
import { ref, getDownloadURL, type UploadTaskSnapshot, type UploadTask } from "firebase/storage";
import { uploadPhoto, type UploadMethod } from "@/lib/uploads/uploadPhoto";
import { classifyUploadRetryability } from "@/lib/uploads/retryPolicy";

export { getUploadStallReason } from "@/lib/uploads/retryPolicy";

export type ScanEstimate = {
  bodyFatPercent: number;
  bmi: number | null;
  notes: string;
};

export type ScanErrorInfo = {
  code?: string;
  message?: string;
  stage?: string;
  debugId?: string;
  stack?: string;
};

export type WorkoutPlan = {
  summary: string;
  weeks: {
    weekNumber: number;
    days: {
      day: string;
      focus: string;
      exercises: {
        name: string;
        sets: number;
        reps: string;
        notes?: string;
      }[];
    }[];
  }[];
};

export type NutritionPlan = {
  caloriesPerDay: number;
  proteinGrams: number;
  carbsGrams: number;
  fatsGrams: number;
  sampleDay: {
    mealName: string;
    description: string;
    calories: number;
    proteinGrams: number;
    carbsGrams: number;
    fatsGrams: number;
  }[];
};

export type ScanDocument = {
  id: string;
  uid: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
  status:
    | "uploading"
    | "uploaded"
    | "pending"
    | "queued"
    | "processing"
    | "complete"
    | "completed"
    | "failed"
    | "error";
  errorMessage?: string | null;
  errorReason?: string | null;
  errorInfo?: ScanErrorInfo | null;
  lastStep?: string | null;
  lastStepAt?: Date | null;
  progress?: number | null;
  correlationId?: string | null;
  processingRequestedAt?: Date | null;
  processingStartedAt?: Date | null;
  processingHeartbeatAt?: Date | null;
  processingAttemptId?: string | null;
  submitRequestId?: string | null;
  recommendations?: string[] | null;
  photoPaths: {
    front: string;
    back: string;
    left: string;
    right: string;
  };
  input: {
    currentWeightKg: number;
    goalWeightKg: number;
  };
  estimate: ScanEstimate | null;
  workoutPlan: WorkoutPlan | null;
  nutritionPlan: NutritionPlan | null;
  note?: string;
};

export type StartScanResponse = {
  scanId: string;
  storagePaths: {
    front: string;
    back: string;
    left: string;
    right: string;
  };
  debugId?: string;
  correlationId?: string;
};

export type SubmitScanResponse = {
  scanId?: string;
  debugId?: string;
  correlationId?: string;
};

function startUrl(): string {
  return resolveFunctionUrl("VITE_SCAN_START_URL", "startScanSession");
}

function submitUrl(): string {
  return resolveFunctionUrl("VITE_SCAN_SUBMIT_URL", "submitScan");
}

function deleteUrl(): string {
  return resolveFunctionUrl("VITE_SCAN_DELETE_URL", "deleteScan");
}

export type ScanError = {
  code?: string;
  message: string;
  debugId?: string;
  status?: number;
  reason?: string;
  pose?: keyof StartScanResponse["storagePaths"];
};

export type ScanApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ScanError };

function parseTimestamp(value: unknown): Date {
  if (value instanceof Date) return value;
  if (
    value &&
    typeof (value as { toDate?: () => Date }).toDate === "function"
  ) {
    try {
      return (value as { toDate: () => Date }).toDate();
    } catch (err) {
      console.error("scan: failed to parse timestamp", err);
    }
  }
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

type FirestoreScan = Partial<ScanDocument> & Record<string, unknown>;

function toScanDocument(
  id: string,
  uid: string,
  data: FirestoreScan
): ScanDocument {
  const fallbackPaths = data.photoPaths as
    | ScanDocument["photoPaths"]
    | undefined;
  const input = data.input as ScanDocument["input"] | undefined;
  const completedAtRaw = data.completedAt as unknown;
  const lastStepAtRaw = (data as any).lastStepAt as unknown;
  const processingRequestedAtRaw = (data as any).processingRequestedAt as unknown;
  const processingStartedAtRaw = (data as any).processingStartedAt as unknown;
  const processingHeartbeatAtRaw = (data as any).processingHeartbeatAt as unknown;
  const errorInfoRaw = (data as any).errorInfo as ScanErrorInfo | undefined;
  return {
    id,
    uid,
    createdAt: parseTimestamp(data.createdAt),
    updatedAt: parseTimestamp(data.updatedAt),
    completedAt: completedAtRaw ? parseTimestamp(completedAtRaw) : null,
    status: (data.status as ScanDocument["status"]) ?? "pending",
    errorMessage:
      typeof data.errorMessage === "string" ? data.errorMessage : null,
    errorReason:
      typeof (data as any).errorReason === "string" ? (data as any).errorReason : null,
    errorInfo:
      errorInfoRaw && typeof errorInfoRaw === "object"
        ? {
            code: typeof errorInfoRaw.code === "string" ? errorInfoRaw.code : undefined,
            message:
              typeof errorInfoRaw.message === "string"
                ? errorInfoRaw.message
                : undefined,
            stage:
              typeof errorInfoRaw.stage === "string" ? errorInfoRaw.stage : undefined,
            debugId:
              typeof errorInfoRaw.debugId === "string"
                ? errorInfoRaw.debugId
                : undefined,
            stack:
              typeof errorInfoRaw.stack === "string" ? errorInfoRaw.stack : undefined,
          }
        : null,
    lastStep:
      typeof (data as any).lastStep === "string" ? (data as any).lastStep : null,
    lastStepAt: lastStepAtRaw ? parseTimestamp(lastStepAtRaw) : null,
    progress:
      typeof (data as any).progress === "number" && Number.isFinite((data as any).progress)
        ? (data as any).progress
        : null,
    correlationId:
      typeof (data as any).correlationId === "string"
        ? (data as any).correlationId
        : null,
    processingRequestedAt: processingRequestedAtRaw
      ? parseTimestamp(processingRequestedAtRaw)
      : null,
    processingStartedAt: processingStartedAtRaw
      ? parseTimestamp(processingStartedAtRaw)
      : null,
    processingHeartbeatAt: processingHeartbeatAtRaw
      ? parseTimestamp(processingHeartbeatAtRaw)
      : null,
    processingAttemptId:
      typeof (data as any).processingAttemptId === "string"
        ? (data as any).processingAttemptId
        : null,
    submitRequestId:
      typeof (data as any).submitRequestId === "string"
        ? (data as any).submitRequestId
        : null,
    recommendations: Array.isArray((data as any).recommendations)
      ? ((data as any).recommendations
          .map((v: any) => (typeof v === "string" ? v.trim() : ""))
          .filter((v: string) => v.length > 0)
          .slice(0, 8) as string[])
      : null,
    photoPaths:
      fallbackPaths ??
      ({
        front: "",
        back: "",
        left: "",
        right: "",
      } satisfies ScanDocument["photoPaths"]),
    input:
      input ??
      ({
        currentWeightKg: 0,
        goalWeightKg: 0,
      } satisfies ScanDocument["input"]),
    estimate: (data.estimate as ScanEstimate | null) ?? null,
    workoutPlan: (data.workoutPlan as WorkoutPlan | null) ?? null,
    nutritionPlan: (data.nutritionPlan as NutritionPlan | null) ?? null,
    note: typeof data.note === "string" ? data.note : undefined,
  };
}

function buildScanError(
  err: unknown,
  fallbackMessage: string,
  reason?: string
): ScanError {
  if (err instanceof ApiError) {
    const data = (err.data ?? {}) as {
      code?: string;
      message?: string;
      debugId?: string;
      reason?: string;
    };
    const message =
      typeof data.message === "string" && data.message.length
        ? data.message
        : fallbackMessage;
    return {
      code: err.code ?? data.code,
      message,
      debugId: data.debugId,
      status: err.status,
      reason: reason ?? data.reason,
    };
  }
  if (err instanceof Error) return { message: err.message, reason };
  return { message: fallbackMessage, reason };
}

export function deserializeScanDocument(
  id: string,
  uid: string,
  data: Record<string, unknown>
): ScanDocument {
  return toScanDocument(id, uid, data);
}

export async function startScanSessionClient(
  params: {
    currentWeightKg: number;
    goalWeightKg: number;
    correlationId?: string;
  },
  options?: { signal?: AbortSignal; timeoutMs?: number }
): Promise<ScanApiResult<StartScanResponse>> {
  const user = auth.currentUser;
  if (!user)
    return {
      ok: false,
      error: { message: "Please sign in before starting a scan." },
    };
  try {
    const data = await apiFetch<StartScanResponse>(startUrl(), {
      method: "POST",
      timeoutMs: options?.timeoutMs ?? 20_000,
      signal: options?.signal,
      body: {
        currentWeightKg: params.currentWeightKg,
        goalWeightKg: params.goalWeightKg,
        correlationId: params.correlationId,
      },
    });
    if (!data?.scanId) {
      return {
        ok: false,
        error: { message: "We couldn't start your scan. Please try again." },
      };
    }
    return { ok: true, data };
  } catch (err) {
    console.error("scan:start error", err);
    return {
      ok: false,
      error: buildScanError(err, "Unable to start your scan right now."),
    };
  }
}


export type ScanUploadProgress = {
  pose: keyof StartScanResponse["storagePaths"];
  fileIndex: number;
  fileCount: number;
  bytesTransferred: number;
  totalBytes: number;
  percent: number;
  overallPercent: number;
  hasBytesTransferred: boolean;
  status?: "preparing" | "uploading" | "retrying" | "done" | "failed";
  attempt?: number;
};

const MIN_VISIBLE_PROGRESS = 0.01;

type UploadTarget = {
  pose: keyof StartScanResponse["storagePaths"];
  path: string;
  file: File;
  size: number;
};

export function validateScanUploadInputs(params: {
  storagePaths: { front: string; back: string; left: string; right: string };
  photos: { front: File; back: File; left: File; right: File };
}): ScanApiResult<{
  uploadTargets: UploadTarget[];
  totalBytes: number;
}> {
  const entries = Object.entries(params.storagePaths) as Array<
    [keyof typeof params.storagePaths, string]
  >;
  if (!entries.length) {
    return { ok: false, error: { message: "Missing upload targets for this scan." } };
  }
  const uploadTargets: UploadTarget[] = [];
  for (const [pose, path] of entries) {
    const file = params.photos[pose];
    if (!file) {
      return { ok: false, error: { message: `Missing ${pose} photo.`, reason: "upload_failed" } };
    }
    const size = Number.isFinite(file.size) ? Number(file.size) : 0;
    uploadTargets.push({ pose, path, file, size });
  }
  if (!uploadTargets.length) {
    return { ok: false, error: { message: "No photos selected for this scan.", reason: "upload_failed" } };
  }
  const zeroByteTargets = uploadTargets.filter((target) => target.size <= 0);
  if (zeroByteTargets.length) {
    const poses = zeroByteTargets.map((target) => target.pose).join(", ");
    return {
      ok: false,
      error: {
        message: `We couldn't read your ${poses} photo. Please retake and try again.`,
        reason: "upload_failed",
      },
    };
  }
  const totalBytes = uploadTargets.reduce((sum, target) => sum + target.size, 0);
  return { ok: true, data: { uploadTargets, totalBytes } };
}

function clampProgressFraction(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function ensureVisibleProgress(value: number, hasBytes: boolean): number {
  if (!hasBytes) {
    return clampProgressFraction(value);
  }
  const baseline = value <= 0 ? MIN_VISIBLE_PROGRESS : value;
  return clampProgressFraction(baseline);
}

function normalizeUploadError(err: unknown): ScanError | null {
  const anyErr = err as any;
  const code = typeof anyErr?.code === "string" ? anyErr.code : undefined;
  const pose =
    anyErr?.pose === "front" ||
    anyErr?.pose === "back" ||
    anyErr?.pose === "left" ||
    anyErr?.pose === "right"
      ? (anyErr.pose as keyof StartScanResponse["storagePaths"])
      : undefined;
  if (!code) return null;
  if (code === "upload_offline") {
    return {
      code,
      message: pose
        ? `${pose.charAt(0).toUpperCase()}${pose.slice(1)} upload paused (connection lost). Please retry.`
        : "Connection lost during upload. Please retry.",
      reason: "upload_failed",
      pose,
    };
  }
  if (code === "upload_timeout") {
    return {
      code,
      message: pose
        ? `${pose.charAt(0).toUpperCase()}${pose.slice(1)} upload timed out. Please retry.`
        : "Upload timed out. Please retry.",
      reason: "upload_failed",
      pose,
    };
  }
  if (code === "upload_paused") {
    return {
      code,
      message: pose
        ? `${pose.charAt(0).toUpperCase()}${pose.slice(1)} upload paused for too long. Retrying usually fixes this.`
        : "Upload paused for too long. Retrying usually fixes this.",
      reason: "upload_failed",
      pose,
    };
  }
  if (code === "upload_stalled" || code === "upload_no_progress") {
    return {
      code,
      message: pose
        ? `${pose.charAt(0).toUpperCase()}${pose.slice(1)} upload stalled. Please retry.`
        : "Upload stalled. Please retry.",
      reason: "upload_failed",
      pose,
    };
  }
  if (code === "upload_cancelled") {
    return {
      code,
      message: "Upload cancelled.",
      reason: "upload_failed",
      pose,
    };
  }
  if (code === "cors_blocked") {
    return {
      code,
      message: pose
        ? `${pose.charAt(0).toUpperCase()}${pose.slice(1)} upload blocked by a network/CORS issue. Please retry.`
        : "Upload blocked by a network/CORS issue. Please retry.",
      reason: "upload_failed",
      pose,
    };
  }
  if (code.startsWith("function/")) {
    const rawMessage =
      typeof anyErr?.message === "string" && anyErr.message.length
        ? (anyErr.message as string)
        : "";
    const message =
      code === "function/unauthenticated"
        ? "Upload blocked (unauthorized). Please sign in again and retry."
        : code === "function/permission-denied"
          ? "Upload blocked (permission denied). Please sign in again and retry."
          : code === "function/invalid-argument"
            ? "Upload rejected. Please retry with a new scan."
            : "Upload failed. Please check your connection and retry.";
    const combined = rawMessage ? `${code} · ${rawMessage}` : code;
    return {
      code,
      message: pose
        ? `${pose.charAt(0).toUpperCase()}${pose.slice(1)} upload failed. ${message} (${combined})`
        : `${message} (${combined})`,
      reason: "upload_failed",
      pose,
    };
  }
  if (code.startsWith("storage/")) {
    const rawMessage =
      typeof anyErr?.message === "string" && anyErr.message.length
        ? (anyErr.message as string)
        : "";
    const message =
      code === "storage/unauthorized"
        ? "Upload blocked (unauthorized). Please sign in again and retry."
        : code === "storage/canceled"
          ? "Upload cancelled. Please retry."
          : code === "storage/retry-limit-exceeded"
            ? "Upload failed after retries. Check your connection and try again."
            : "Upload failed. Please check your connection and retry.";
    const combined = rawMessage ? `${code} · ${rawMessage}` : code;
    return {
      code,
      message: pose
        ? `${pose.charAt(0).toUpperCase()}${pose.slice(1)} upload failed. ${message} (${combined})`
        : `${message} (${combined})`,
      reason: "upload_failed",
      pose,
    };
  }
  return null;
}

function isProbablyMobileUploadDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = String(navigator.userAgent || "");
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const isAndroid = /Android/i.test(ua);
  // iPadOS can present as "Macintosh" with touch points.
  const maxTouchPoints =
    typeof (navigator as any).maxTouchPoints === "number"
      ? Number((navigator as any).maxTouchPoints)
      : 0;
  const isIPadLike = /Macintosh/i.test(ua) && maxTouchPoints > 1;
  return isIOS || isAndroid || isIPadLike;
}

export function createScanCorrelationId(seed?: string): string {
  const prefix = String(seed || "scan").slice(0, 12);
  const random =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `${prefix}-${random.slice(0, 8)}`;
}

function buildUploadCorrelationId(
  scanCorrelationId: string,
  pose: string,
  attempt: number
): string {
  return `${scanCorrelationId}-${pose}-${attempt}`;
}

export async function submitScanClient(
  params: {
    scanId: string;
    storagePaths: { front: string; back: string; left: string; right: string };
    photos: { front: File; back: File; left: File; right: File };
    currentWeightKg: number;
    goalWeightKg: number;
    scanCorrelationId?: string;
  },
  options?: {
    onUploadProgress?: (progress: ScanUploadProgress) => void;
    onPhotoState?: (info: {
      pose: keyof StartScanResponse["storagePaths"];
      status: "preparing" | "uploading" | "retrying" | "done" | "failed";
      attempt?: number;
      percent?: number;
      message?: string;
      nextRetryAt?: number;
      nextRetryDelayMs?: number;
      offline?: boolean;
      original?: UploadPreprocessMeta;
      compressed?: UploadPreprocessMeta;
      preprocessDebug?: UploadPreprocessResult["debug"];
      bytesTransferred?: number;
      totalBytes?: number;
      lastFirebaseError?: { code?: string; message?: string; serverResponse?: string };
      lastUploadError?: { code?: string; message?: string; details?: unknown };
      taskState?: "running" | "paused" | "success" | "canceled" | "error";
      lastProgressAt?: number;
      bucket?: string;
      fullPath?: string;
      pathMismatch?: { expected: string; actual: string };
      uploadMethod?: UploadMethod;
      correlationId?: string;
      elapsedMs?: number;
    }) => void;
    onUploadTask?: (info: { pose: keyof StartScanResponse["storagePaths"]; task: UploadTask }) => void;
    signal?: AbortSignal;
    stallTimeoutMs?: number;
    posesToUpload?: Array<keyof StartScanResponse["storagePaths"]>;
    perPhotoTimeoutMs?: number;
    overallTimeoutMs?: number;
  }
): Promise<ScanApiResult<SubmitScanResponse>> {
  const user = auth.currentUser;
  if (!user)
    return {
      ok: false,
      error: { message: "Please sign in before submitting a scan." },
    };
  let uploadsCompleted = false;
  let combinedSignal: AbortController | null = null;
  let overallDeadlineAt = 0;
  try {
    // Auth freshness: iOS Safari can hold stale tokens across tab restores.
    // Force refresh right before first upload attempt.
    try {
      await user.getIdToken(true);
    } catch (error: any) {
      return {
        ok: false,
        error: {
          code: "auth/token-refresh-failed",
          message:
            typeof error?.message === "string" && error.message.length
              ? `Could not refresh your sign-in session: ${error.message}`
              : "Could not refresh your sign-in session. Please sign in again.",
          reason: "upload_failed",
        },
      };
    }

    // iPhone Safari resilience: keep retry windows bounded so we don't appear stuck forever.
    try {
      // Firebase v11 doesn't export the older helper functions in all builds.
      // The SDK exposes these as mutable properties.
      (storage as any).maxUploadRetryTime = 120_000;
      (storage as any).maxOperationRetryTime = 120_000;
    } catch {
      // ignore
    }

    const orderedPoses: Array<keyof StartScanResponse["storagePaths"]> = [
      "front",
      "back",
      "left",
      "right",
    ];
    const posesToUpload = options?.posesToUpload?.length
      ? orderedPoses.filter((p) => options.posesToUpload!.includes(p))
      : orderedPoses;

    // Normalize + validate storage paths to avoid per-pose mismatches (e.g. "front" only).
    for (const pose of orderedPoses) {
      const expected = buildScanPhotoPath({
        uid: user.uid,
        scanId: params.scanId,
        view: pose as ScanPose,
      });
      const actual = params.storagePaths[pose];
      if (actual !== expected) {
        options?.onPhotoState?.({
          pose,
          status: "failed",
          message: "Upload target mismatch (client/server path disagreement).",
          pathMismatch: { expected, actual },
          fullPath: actual,
          bucket: String((storage as any)?.app?.options?.storageBucket || ""),
        });
        return {
          ok: false,
          error: {
            code: "scan/storage-path-mismatch",
            message: `Upload configuration mismatch for ${pose}.`,
            reason: "upload_failed",
            pose,
          },
        };
      }
    }

    // Preprocess photos (mandatory): ALWAYS produce a prepared JPEG File (<= 2.0MB).
    // Do NOT fall back to original files (often huge PNGs / HEIC on iOS).
    const photos = { ...params.photos } as typeof params.photos;
    for (const pose of posesToUpload) {
      const original = params.photos[pose];
      options?.onPhotoState?.({ pose, status: "preparing" });
      const t0 = Date.now();
      try {
        const processed = await prepareScanPhoto(original, pose);
        const t1 = Date.now();
        console.info("scan.preprocess", {
          pose,
          inBytes: processed.meta.original.size,
          outBytes: processed.meta.prepared.size,
          ms: t1 - t0,
          inType: processed.meta.original.type,
          outType: processed.meta.prepared.type,
          maxEdge: processed.meta.debug.maxEdgeFinal,
          quality: processed.meta.debug.qualityFinal,
        });
        photos[pose] = processed.preparedFile;
        options?.onPhotoState?.({
          pose,
          status: "preparing",
          original: processed.meta.original,
          compressed: processed.meta.prepared,
          preprocessDebug: processed.meta.debug,
        });
      } catch (err) {
        const t1 = Date.now();
        console.warn("scan.preprocess_failed", {
          pose,
          ms: t1 - t0,
          message: (err as Error)?.message,
        });
        options?.onPhotoState?.({
          pose,
          status: "failed",
          message: "Couldn’t prepare photo on this device",
        });
        const e: any = new Error(
          "Couldn’t prepare photo on this device"
        );
        e.code = "preprocess_failed";
        e.pose = pose;
        throw e;
      }
    }

    // Build upload targets in strict, reliable order (front → back → left → right),
    // filtered to the poses we are uploading (supports per-photo retries).
    const uploadTargets: UploadTarget[] = [];
    for (const pose of posesToUpload) {
      const path = params.storagePaths[pose];
      const file = photos[pose];
      if (!file) {
        return { ok: false, error: { message: `Missing ${pose} photo.`, reason: "upload_failed" } };
      }
      const size = Number.isFinite(file.size) ? Number(file.size) : 0;
      uploadTargets.push({ pose, path, file, size });
    }
    if (!uploadTargets.length) {
      // Nothing to upload (e.g. retry invoked with empty pose list)
      uploadsCompleted = true;
    }

    const fileCount = uploadTargets.length;
    const totalBytes = uploadTargets.reduce((sum, target) => sum + (target.size || 0), 0);
    const safeTotalBytes = totalBytes > 0 ? totalBytes : fileCount;
    const fallbackDenominator = fileCount || 1;
    let uploadedBytes = 0;

    const stallTimeoutMs = options?.stallTimeoutMs ?? 12_000;
    const effectiveStallTimeoutMs =
      typeof stallTimeoutMs === "number" && Number.isFinite(stallTimeoutMs)
        ? stallTimeoutMs
        : 20_000;

    const perPhotoTimeoutMs =
      typeof options?.perPhotoTimeoutMs === "number" && Number.isFinite(options.perPhotoTimeoutMs)
        ? Math.max(5_000, options.perPhotoTimeoutMs)
        : 60_000;
    const overallTimeoutMs =
      typeof options?.overallTimeoutMs === "number" && Number.isFinite(options.overallTimeoutMs)
        ? Math.max(60_000, options.overallTimeoutMs)
        : 4 * 60_000;
    const overallStartedAt = Date.now();
    overallDeadlineAt = overallStartedAt + overallTimeoutMs;

    combinedSignal = (() => {
      const ctrl = new AbortController();
      const abort = () => {
        try {
          ctrl.abort();
        } catch {
          // ignore
        }
      };
      const checkDeadline = () => {
        if (Date.now() >= overallDeadlineAt) abort();
      };
      const onVis = () => {
        if (document.visibilityState === "visible") checkDeadline();
      };
      const onOnline = () => checkDeadline();
      let interval: number | null = null;
      try {
        document.addEventListener("visibilitychange", onVis);
        window.addEventListener("online", onOnline);
      } catch {
        // ignore
      }
      if (typeof window !== "undefined") {
        interval = window.setInterval(checkDeadline, 1000);
      }
      if (options?.signal) {
        if (options.signal.aborted) abort();
        else {
          try {
            options.signal.addEventListener("abort", abort, { once: true });
          } catch {
            // ignore
          }
        }
      }
      checkDeadline();
      (ctrl as any).__cleanup = () => {
        if (interval != null) window.clearInterval(interval);
        try {
          document.removeEventListener("visibilitychange", onVis);
          window.removeEventListener("online", onOnline);
        } catch {
          // ignore
        }
        if (options?.signal) {
          try {
            options.signal.removeEventListener("abort", abort);
          } catch {
            // ignore
          }
        }
      };
      return ctrl;
    })();
    const maxAttempts = isProbablyMobileUploadDevice() ? 5 : 3;
    const retryDelaysMs = [1000, 2000, 4000, 8000, 16_000];
    const preferredUploadMethod: UploadMethod = "storage";
    const scanCorrelationId =
      params.scanCorrelationId ?? createScanCorrelationId(params.scanId);

    for (const [index, target] of uploadTargets.entries()) {
      let attempt = 0;
      let succeeded = false;
      while (!succeeded && attempt < maxAttempts) {
        attempt += 1;
        const isRetry = attempt > 1;
        const attemptStartedAt = Date.now();
        const correlationId = buildUploadCorrelationId(
          scanCorrelationId,
          target.pose,
          attempt
        );
        let activeMethod: UploadMethod = preferredUploadMethod;
        options?.onPhotoState?.({
          pose: target.pose,
          status: isRetry ? "retrying" : "uploading",
          attempt,
          uploadMethod: activeMethod,
          correlationId,
        });
        console.info("scan.upload_attempt", {
          pose: target.pose,
          attempt,
          path: target.path,
          bytes: target.file.size,
          method: preferredUploadMethod,
          correlationId,
        });

        let lastSnapshot: UploadTaskSnapshot | null = null;
        let lastEmittedBytes = -1;
        let lastEmittedAt = 0;
        let lastAttemptBytesTransferred = 0;
        let lastAttemptTotalBytes = target.size || 1;
        try {
          // Refresh auth once per "attempt group": first attempt, and first retry.
          if (attempt === 1 || attempt === 2) {
            await user.getIdToken(true);
          }
          const remainingOverall = Math.max(0, overallDeadlineAt - Date.now());
          const attemptTimeoutMs = Math.max(5_000, Math.min(perPhotoTimeoutMs, remainingOverall));
          if (attemptTimeoutMs <= 5_000 && remainingOverall <= 5_000) {
            const timeoutErr: any = new Error("Scan timed out. Please retry.");
            timeoutErr.code = "scan/overall-timeout";
            throw timeoutErr;
          }

          const debugFreeze =
            typeof window !== "undefined" &&
            new URLSearchParams(window.location.search).get("debug") === "1" &&
            (new URLSearchParams(window.location.search).get("freezeUpload") === "1" ||
              window.localStorage?.getItem("mbs.debug.freezeUpload") === "1");

          const uploadResult = await uploadPhoto({
            storage,
            path: target.path,
            file: target.file,
            correlationId,
            customMetadata: {
              scanCorrelationId,
              scanId: params.scanId,
              pose: target.pose,
              attempt: String(attempt),
              uploadCorrelationId: correlationId,
            },
            signal: combinedSignal!.signal,
            storageTimeoutMs: attemptTimeoutMs,
            stallTimeoutMs: effectiveStallTimeoutMs,
            debugSimulateFreeze: Boolean(debugFreeze),
            onMethodChange: (info) => {
              activeMethod = info.method;
              options?.onPhotoState?.({
                pose: target.pose,
                status: isRetry ? "retrying" : "uploading",
                attempt,
                uploadMethod: info.method,
                correlationId,
              });
            },
            onTask: (task) => {
              try {
                options?.onUploadTask?.({ pose: target.pose, task });
              } catch {
                // ignore
              }
            },
            onProgress: (progress) => {
              // Fabricate a minimal snapshot-like object for diagnostics.
              lastSnapshot = {
                bytesTransferred: progress.bytesTransferred,
                totalBytes: progress.totalBytes,
                state: progress.taskState,
              } as any;

              const snapshotTotal = progress.totalBytes || target.size || 1;
              const snapshotBytes = progress.bytesTransferred || 0;
              lastAttemptBytesTransferred = snapshotBytes;
              lastAttemptTotalBytes = snapshotTotal;

              const hasTransferred =
                snapshotBytes > 0 ||
                progress.taskState === "running" ||
                progress.taskState === "paused";
              const filePercent = ensureVisibleProgress(
                snapshotTotal > 0 ? snapshotBytes / snapshotTotal : 0,
                hasTransferred
              );
              const bytesBasis =
                safeTotalBytes > 0
                  ? (uploadedBytes + snapshotBytes) / safeTotalBytes
                  : (index + filePercent) / fallbackDenominator;
              const overallPercent = ensureVisibleProgress(bytesBasis, hasTransferred);

              // Reduce UI churn: emit at most ~6-7 times/second, or on meaningful byte movement.
              const now = Date.now();
              const bytesDelta = Math.abs(snapshotBytes - lastEmittedBytes);
              const timeDelta = now - lastEmittedAt;
              const shouldEmit =
                lastEmittedBytes < 0 ||
                bytesDelta >= 64 * 1024 ||
                timeDelta >= 150 ||
                progress.taskState !== "running";
              if (!shouldEmit) return;
              lastEmittedBytes = snapshotBytes;
              lastEmittedAt = now;

              options?.onUploadProgress?.({
                pose: target.pose,
                fileIndex: index,
                fileCount,
                bytesTransferred: snapshotBytes,
                totalBytes: snapshotTotal,
                percent: filePercent,
                overallPercent,
                hasBytesTransferred: hasTransferred,
                status: isRetry ? "retrying" : "uploading",
                attempt,
              });
              options?.onPhotoState?.({
                pose: target.pose,
                status: isRetry ? "retrying" : "uploading",
                attempt,
                percent: filePercent,
                bytesTransferred: snapshotBytes,
                totalBytes: snapshotTotal,
                taskState: progress.taskState as any,
                lastProgressAt: progress.lastProgressAt,
                fullPath: target.path,
                bucket: String((storage as any)?.app?.options?.storageBucket || ""),
                offline: typeof navigator !== "undefined" ? navigator.onLine === false : false,
                uploadMethod: activeMethod,
                correlationId,
              });
            },
          });
          const elapsedMs = Date.now() - attemptStartedAt;
          options?.onPhotoState?.({
            pose: target.pose,
            status: isRetry ? "retrying" : "uploading",
            attempt,
            uploadMethod: uploadResult.method,
            correlationId,
            elapsedMs,
            bucket: String((storage as any)?.app?.options?.storageBucket || ""),
            fullPath: target.path,
          });
          succeeded = true;
        } catch (err) {
          const normalized = normalizeUploadError(err);
          const rawCode =
            typeof (err as any)?.code === "string" ? ((err as any).code as string) : undefined;
          const rawMessage =
            typeof (err as any)?.message === "string"
              ? ((err as any).message as string)
              : undefined;
          const serverResponse =
            typeof (err as any)?.serverResponse === "string"
              ? (err as any).serverResponse
              : undefined;
          console.warn("scan.upload_failed", {
            pose: target.pose,
            attempt,
            code: rawCode,
            message: rawMessage,
            normalizedCode: normalized?.code,
            state: lastSnapshot?.state,
            method: activeMethod,
            correlationId,
          });
          const overallTimedOut =
            Boolean(combinedSignal?.signal?.aborted) && Date.now() >= overallDeadlineAt;
          const effectiveCode = overallTimedOut ? "scan/overall-timeout" : rawCode ?? normalized?.code;
          if (overallTimedOut) {
            options?.onPhotoState?.({
              pose: target.pose,
              status: "failed",
              attempt,
              message: "Scan timed out. Please retry.",
              lastFirebaseError: {
                code: rawCode ?? normalized?.code,
                message: rawMessage ?? normalized?.message,
                serverResponse,
              },
              taskState: lastSnapshot?.state,
              fullPath: target.path,
              bucket: String((storage as any)?.app?.options?.storageBucket || ""),
              offline: typeof navigator !== "undefined" ? navigator.onLine === false : false,
              uploadMethod: activeMethod,
              correlationId,
            });
            const e: any = new Error("Scan timed out. Please retry.");
            e.code = "scan/overall-timeout";
            e.pose = target.pose;
            throw e;
          }
          const retryability = classifyUploadRetryability({
            code: effectiveCode,
            bytesTransferred: lastAttemptBytesTransferred,
            wasOffline: Boolean((err as any)?.wasOffline) || (typeof navigator !== "undefined" && navigator.onLine === false),
          });
          if (attempt < maxAttempts && retryability.retryable) {
            const backoff = retryDelaysMs[attempt - 1] ?? 2000;
            const nextRetryAt = Date.now() + backoff;
            options?.onPhotoState?.({
              pose: target.pose,
              status: "retrying",
              attempt,
              message:
                retryability.reason === "transient_network" &&
                typeof navigator !== "undefined" &&
                navigator.onLine === false
                  ? "Connection lost — retrying when you’re back online…"
                  : retryability.reason === "stall"
                    ? `Connection paused — retrying in ${Math.max(1, Math.round(backoff / 1000))}s…`
                    : `Retrying in ${Math.max(1, Math.round(backoff / 1000))}s…`,
              nextRetryAt,
              nextRetryDelayMs: backoff,
              // Important: preserve the raw Firebase error code/message for diagnostics.
              lastFirebaseError: {
                code: rawCode ?? normalized?.code,
                message: rawMessage ?? normalized?.message,
                serverResponse,
              },
              lastUploadError: {
                code: rawCode ?? normalized?.code,
                message: rawMessage ?? normalized?.message,
              },
              taskState: lastSnapshot?.state,
              fullPath: target.path,
              bucket: String((storage as any)?.app?.options?.storageBucket || ""),
              offline: typeof navigator !== "undefined" ? navigator.onLine === false : false,
              uploadMethod: activeMethod,
              correlationId,
            });
            // If offline, wait for connectivity (up to overall deadline), then retry immediately.
            if (typeof navigator !== "undefined" && navigator.onLine === false) {
              await waitForOnlineOrAbort({
                signal: combinedSignal!.signal,
                deadlineAt: overallDeadlineAt,
              });
            } else {
              await new Promise((r) => setTimeout(r, backoff));
            }
            continue;
          }
          options?.onPhotoState?.({
            pose: target.pose,
            status: "failed",
            attempt,
            message:
              rawCode?.startsWith("storage/")
                ? `${rawCode} · ${rawMessage ?? normalized?.message ?? "Upload failed."}`
                : normalized?.message ?? rawMessage ?? "Upload failed.",
            // Important: preserve the raw Firebase error code/message for diagnostics.
            lastFirebaseError: {
              code: rawCode ?? normalized?.code,
              message: rawMessage ?? normalized?.message,
              serverResponse,
            },
            lastUploadError: {
              code: rawCode ?? normalized?.code,
              message: rawMessage ?? normalized?.message,
            },
            taskState: lastSnapshot?.state,
            fullPath: target.path,
            bucket: String((storage as any)?.app?.options?.storageBucket || ""),
            offline: typeof navigator !== "undefined" ? navigator.onLine === false : false,
            uploadMethod: activeMethod,
            correlationId,
          });
          const finalErr: any = normalized
            ? Object.assign(new Error(normalized.message), {
                code: normalized.code,
              })
            : err;
          // Attach pose so the UI can say exactly which photo failed/stalled.
          finalErr.pose = target.pose;
          finalErr.correlationId = correlationId;
          throw finalErr;
        }
      }

      // Persist per-photo metadata immediately after upload so the UI/history can recover.
      try {
        const fileRef = ref(storage, target.path);
        const url = await getDownloadURL(fileRef);
        await setDoc(
          doc(db, "users", user.uid, "scans", params.scanId),
          {
            photoPaths: { [target.pose]: target.path },
            photoUrls: { [target.pose]: url },
            uploadMeta: {
              [target.pose]: {
                bytes: target.file.size,
                contentType: target.file.type || "image/jpeg",
                uploadedAt: new Date().toISOString(),
              },
            },
            updatedAt: new Date(),
          } as any,
          { merge: true }
        );
      } catch (err) {
        console.warn("scan.upload_meta_write_failed", {
          pose: target.pose,
          message: (err as Error)?.message,
        });
      }

      uploadedBytes += target.size;
      const normalizedOverall =
        safeTotalBytes > 0
          ? uploadedBytes / safeTotalBytes
          : (index + 1) / fallbackDenominator;
      options?.onUploadProgress?.({
        pose: target.pose,
        fileIndex: index,
        fileCount,
        bytesTransferred: target.size,
        totalBytes: target.size,
        percent: 1,
        overallPercent: clampProgressFraction(normalizedOverall),
        hasBytesTransferred: true,
        status: "done",
        attempt: 1,
      });
      options?.onPhotoState?.({ pose: target.pose, status: "done", percent: 1 });
    }

    uploadsCompleted = true;
    // `submitScan` now just enqueues background processing, so it should respond fast.
    // Keep the timeout modest to avoid leaving users stuck if the submit call fails.
    const remainingForSubmit = Math.max(5_000, overallDeadlineAt - Date.now());
    const submitResponse = await apiFetch<SubmitScanResponse>(submitUrl(), {
      method: "POST",
      timeoutMs: Math.min(30_000, remainingForSubmit),
      retries: 0,
      signal: combinedSignal!.signal,
      body: {
        scanId: params.scanId,
        photoPaths: params.storagePaths,
        currentWeightKg: params.currentWeightKg,
        goalWeightKg: params.goalWeightKg,
        correlationId: scanCorrelationId,
      },
    });
    try {
      (combinedSignal as any)?.__cleanup?.();
    } catch {
      // ignore
    }
    return { ok: true, data: submitResponse ?? {} };
  } catch (err) {
    console.error("scan:submit error", { scanId: params.scanId, error: err });
    try {
      // always cleanup deadline listeners
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (combinedSignal as any)?.__cleanup?.();
    } catch {
      // ignore
    }
    const reason = uploadsCompleted ? "submit_failed" : "upload_failed";
    const timedOut =
      Boolean(combinedSignal?.signal?.aborted) &&
      overallDeadlineAt > 0 &&
      Date.now() >= overallDeadlineAt;
    if (timedOut) {
      return {
        ok: false,
        error: {
          code: "scan/overall-timeout",
          message: "This scan is taking too long. Please retry.",
          reason,
        },
      };
    }
    const fallback = uploadsCompleted
      ? "We couldn't process your scan. Please try again."
      : "Could not upload your photos. Please try again.";
    const normalizedUpload = !uploadsCompleted ? normalizeUploadError(err) : null;
    return {
      ok: false,
      error: normalizedUpload ?? buildScanError(err, fallback, reason),
    };
  }
}

async function waitForOnlineOrAbort(params: { signal: AbortSignal; deadlineAt: number }) {
  if (params.signal.aborted) {
    const err: any = new Error("Upload cancelled.");
    err.code = "upload_cancelled";
    throw err;
  }
  if (typeof navigator === "undefined") return;
  if (navigator.onLine) return;
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      if (settled) return;
      settled = true;
      try {
        window.removeEventListener("online", onOnline);
      } catch {
        // ignore
      }
      try {
        params.signal.removeEventListener("abort", onAbort);
      } catch {
        // ignore
      }
      if (timer) clearTimeout(timer);
    };
    const onOnline = () => {
      cleanup();
      resolve();
    };
    const onAbort = () => {
      cleanup();
      const err: any = new Error("Upload cancelled.");
      err.code = "upload_cancelled";
      reject(err);
    };
    const now = Date.now();
    const remaining = Math.max(0, params.deadlineAt - now);
    const timer =
      remaining > 0
        ? setTimeout(() => {
            cleanup();
            const err: any = new Error("Connection lost for too long. Please retry.");
            err.code = "upload_offline";
            reject(err);
          }, remaining)
        : null;
    try {
      window.addEventListener("online", onOnline, { once: true } as any);
    } catch {
      // ignore
    }
    params.signal.addEventListener("abort", onAbort, { once: true });
  });
}

export async function retryScanProcessingClient(
  scanId: string
): Promise<ScanApiResult<void>> {
  const user = auth.currentUser;
  if (!user) {
    return {
      ok: false,
      error: { message: "Please sign in before retrying processing." },
    };
  }
  const trimmed = scanId.trim();
  if (!trimmed) return { ok: false, error: { message: "Missing scan id." } };
  try {
    await user.getIdToken(true);
  } catch (err: any) {
    return {
      ok: false,
      error: {
        code: "auth/token-refresh-failed",
        message:
          typeof err?.message === "string" && err.message.length
            ? `Could not refresh your sign-in session: ${err.message}`
            : "Could not refresh your sign-in session. Please sign in again.",
        reason: "submit_failed",
      },
    };
  }
  try {
    const refDoc = doc(db, "users", user.uid, "scans", trimmed);
    const snap = await getDoc(refDoc);
    if (!snap.exists()) {
      return { ok: false, error: { message: "Scan not found.", reason: "submit_failed" } };
    }
    const data = snap.data() as any;
    const photoPaths = data?.photoPaths;
    const input = data?.input;
    const currentWeightKg = Number(input?.currentWeightKg);
    const goalWeightKg = Number(input?.goalWeightKg);
    const correlationId =
      typeof data?.correlationId === "string" ? (data.correlationId as string) : undefined;
    if (!photoPaths || typeof photoPaths !== "object") {
      return {
        ok: false,
        error: { message: "Missing photo paths for this scan.", reason: "submit_failed" },
      };
    }
    if (!Number.isFinite(currentWeightKg) || !Number.isFinite(goalWeightKg)) {
      return {
        ok: false,
        error: { message: "Missing scan input (weights).", reason: "submit_failed" },
      };
    }
    await apiFetch(submitUrl(), {
      method: "POST",
      timeoutMs: 30_000,
      retries: 0,
      body: {
        scanId: trimmed,
        photoPaths: {
          front: String(photoPaths.front || ""),
          back: String(photoPaths.back || ""),
          left: String(photoPaths.left || ""),
          right: String(photoPaths.right || ""),
        },
        currentWeightKg,
        goalWeightKg,
        correlationId,
      },
    });
    return { ok: true, data: undefined };
  } catch (err) {
    return {
      ok: false,
      error: buildScanError(err, "We couldn't restart processing right now.", "submit_failed"),
    };
  }
}

export async function getScan(
  scanId: string
): Promise<ScanApiResult<ScanDocument>> {
  const uid = auth.currentUser?.uid;
  if (!uid)
    return {
      ok: false,
      error: { message: "Please sign in to view this scan." },
    };
  if (!scanId.trim())
    return { ok: false, error: { message: "Missing scan id." } };
  try {
    const ref = doc(db, "users", uid, "scans", scanId);
    const snap = await getDoc(ref);
    if (!snap.exists())
      return { ok: false, error: { message: "Scan not found." } };
    const data = snap.data() as Record<string, unknown>;
    return { ok: true, data: toScanDocument(snap.id, uid, data) };
  } catch (err) {
    console.error("scan:get error", err);
    return {
      ok: false,
      error: buildScanError(err, "Unable to load this scan right now."),
    };
  }
}

type DeleteScanResponse =
  | { ok: true; data?: { scanId?: string | null } }
  | {
      ok: false;
      error?: {
        code?: string | null;
        message?: string | null;
        debugId?: string | null;
      };
    };

export async function deleteScanApi(
  scanId: string
): Promise<ScanApiResult<void>> {
  const trimmed = scanId.trim();
  if (!trimmed) {
    return { ok: false, error: { message: "Missing scan id." } };
  }

  try {
    const response = await apiFetch<DeleteScanResponse>(deleteUrl(), {
      method: "POST",
      body: { scanId: trimmed },
    });

    if (!response) {
      return {
        ok: false,
        error: { message: "Unable to delete scan. Please try again." },
      };
    }

    if ("ok" in response && !response.ok) {
      const message =
        response.error?.message && response.error.message !== "Bad Request"
          ? response.error.message
          : "Unable to delete scan. Please try again.";
      return {
        ok: false,
        error: {
          message,
          code: response.error?.code ?? undefined,
          debugId: response.error?.debugId ?? undefined,
        },
      };
    }

    return { ok: true, data: undefined };
  } catch (error) {
    console.error("scan:delete error", error);
    return {
      ok: false,
      error: buildScanError(error, "Unable to delete scan. Please try again."),
    };
  }
}
