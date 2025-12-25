/**
 * Pipeline map — Client scan API bridge:
 * - Starts scan sessions (`startScanSessionClient`) so Firestore creates a pending doc + storage paths.
 * - Streams uploads via Firebase Storage, emitting `ScanUploadProgress` so the UI can avoid 0% stalls.
 * - Submits metadata to the HTTPS function, handles cleanup (`deleteScanApi`), and fetches Firestore results.
 */
import { apiFetch, ApiError } from "@/lib/http";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import {
  prepareScanPhoto,
  type UploadPreprocessMeta,
  type UploadPreprocessResult,
} from "@/features/scan/resizeImage";
import { uploadPhoto } from "@/lib/uploads/uploadPhoto";
import { classifyUploadRetryability } from "@/lib/uploads/retryPolicy";
import { isIOSSafari } from "@/lib/isIOSWeb";

export { getUploadStallReason } from "@/lib/uploads/retryPolicy";

export type ScanEstimate = {
  bodyFatPercent: number;
  bmi: number | null;
  notes: string;
  leanMassKg?: number | null;
  fatMassKg?: number | null;
  bmiCategory?: string | null;
  keyObservations?: string[];
  goalRecommendations?: string[];
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
  progressionRules: string[];
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
  trainingDay?: {
    calories: number;
    proteinGrams: number;
    carbsGrams: number;
    fatsGrams: number;
  };
  restDay?: {
    calories: number;
    proteinGrams: number;
    carbsGrams: number;
    fatsGrams: number;
  };
  adjustmentRules: string[];
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
  improvementAreas?: string[] | null;
  disclaimer?: string | null;
  planMarkdown?: string | null;
  metrics?: Record<string, unknown> | null;
  usedFallback?: boolean | null;
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
  workoutProgram?: WorkoutPlan | null;
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
  const env = (import.meta as any).env || {};
  const override = typeof env?.VITE_SCAN_START_URL === "string" ? env.VITE_SCAN_START_URL.trim() : "";
  return override || "/api/scan/start";
}

function submitUrl(): string {
  const env = (import.meta as any).env || {};
  const override = typeof env?.VITE_SCAN_SUBMIT_URL === "string" ? env.VITE_SCAN_SUBMIT_URL.trim() : "";
  return override || "/api/scan/submit";
}

function deleteUrl(): string {
  const env = (import.meta as any).env || {};
  const override = typeof env?.VITE_SCAN_DELETE_URL === "string" ? env.VITE_SCAN_DELETE_URL.trim() : "";
  return override || "/api/scan/delete";
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
    improvementAreas: Array.isArray((data as any).improvementAreas)
      ? ((data as any).improvementAreas
          .map((v: any) => (typeof v === "string" ? v.trim() : ""))
          .filter((v: string) => v.length > 0)
          .slice(0, 10) as string[])
      : null,
    disclaimer:
      typeof (data as any).disclaimer === "string" && (data as any).disclaimer.trim()
        ? ((data as any).disclaimer as string).trim().slice(0, 280)
        : null,
    planMarkdown:
      typeof (data as any).planMarkdown === "string"
        ? ((data as any).planMarkdown as string)
        : null,
    metrics:
      data.metrics && typeof data.metrics === "object"
        ? (data.metrics as Record<string, unknown>)
        : null,
    usedFallback:
      typeof (data as any).usedFallback === "boolean"
        ? ((data as any).usedFallback as boolean)
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
    workoutProgram: ((data as any).workoutProgram as WorkoutPlan | null) ?? null,
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
    const effectiveReason = reason ?? data.reason;
    const normalizedMessage =
      effectiveReason === "engine_not_configured" || effectiveReason === "scan_engine_not_configured"
        ? "Scan unavailable: add OPENAI_API_KEY and OPENAI_MODEL to Cloud Functions config."
        : message;
    return {
      code: err.code ?? data.code,
      message: normalizedMessage,
      debugId: data.debugId,
      status: err.status,
      reason: effectiveReason,
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

/**
 * Pure helper used by `submitScanClient`:
 * - Builds a stable upload plan (targets + total bytes) for the chosen poses.
 * - Exists to prevent regressions like "Can't find variable: uploadTargets" from ever shipping again.
 */
export function buildScanUploadPlan(params: {
  storagePaths: { front: string; back: string; left: string; right: string };
  photos: { front: File; back: File; left: File; right: File };
  posesToUpload?: Array<keyof StartScanResponse["storagePaths"]>;
}): ScanApiResult<{
  uploadTargets: UploadTarget[];
  activeTargets: UploadTarget[];
  totalBytes: number;
  activeBytes: number;
}> {
  const validated = validateScanUploadInputs({
    storagePaths: params.storagePaths,
    photos: params.photos,
  });
  if (!validated.ok) return validated;
  const uploadTargets = validated.data.uploadTargets;
  const totalBytes = validated.data.totalBytes;
  const posesToUpload = params.posesToUpload?.length ? params.posesToUpload : null;
  const activeTargets = posesToUpload
    ? uploadTargets.filter((t) => posesToUpload.includes(t.pose))
    : uploadTargets;
  const activeBytes = activeTargets.reduce((sum, t) => sum + (t.size || 0), 0);
  return { ok: true, data: { uploadTargets, activeTargets, totalBytes, activeBytes } };
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

export function createScanCorrelationId(seed?: string): string {
  const prefix = String(seed || "scan").slice(0, 12);
  const random =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `${prefix}-${random.slice(0, 8)}`;
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
      original?: UploadPreprocessMeta;
      compressed?: UploadPreprocessMeta;
      preprocessDebug?: UploadPreprocessResult["debug"];
      bytesTransferred?: number;
      totalBytes?: number;
      correlationId?: string;
      elapsedMs?: number;
    }) => void;
    signal?: AbortSignal;
    posesToUpload?: Array<keyof StartScanResponse["storagePaths"]>;
    overallTimeoutMs?: number;
    stallTimeoutMs?: number;
    perPhotoTimeoutMs?: number;
    maxConcurrentUploads?: number;
  }
): Promise<ScanApiResult<SubmitScanResponse>> {
  const user = auth.currentUser;
  if (!user)
    return {
      ok: false,
      error: { message: "Please sign in before submitting a scan." },
    };

  const poses: Array<keyof StartScanResponse["storagePaths"]> = ["front", "back", "left", "right"];
  const posesToUpload = options?.posesToUpload?.length
    ? poses.filter((p) => options.posesToUpload!.includes(p))
    : poses;
  const scanCorrelationId =
    params.scanCorrelationId ?? createScanCorrelationId(params.scanId);

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

  const plan = buildScanUploadPlan({
    storagePaths: params.storagePaths,
    photos: params.photos,
    posesToUpload,
  });
  if (!plan.ok) {
    return { ok: false, error: plan.error };
  }
  const validatedTargets = plan.data?.uploadTargets ?? [];
  if (!validatedTargets.length) {
    return {
      ok: false,
      error: { message: "No upload targets available for this scan.", reason: "upload_failed" },
    };
  }
  let uploadTargets = [...validatedTargets];
  let totalBytes = uploadTargets.reduce((sum, target) => sum + target.size, 0);

  const totalSteps = posesToUpload.length + 1; // preprocessing per pose + upload request
  let completedSteps = 0;

  const emitProgress = (
    pose: keyof StartScanResponse["storagePaths"],
    status: ScanUploadProgress["status"],
    fileIndex: number,
    fileCount: number,
    percent: number,
    hasBytes: boolean
  ) => {
    const overallPercent = clampProgressFraction((completedSteps + percent) / totalSteps);
    options?.onUploadProgress?.({
      pose,
      fileIndex,
      fileCount,
      bytesTransferred: percent,
      totalBytes: 1,
      percent,
      overallPercent: ensureVisibleProgress(overallPercent, hasBytes),
      hasBytesTransferred: hasBytes,
      status,
      attempt: 1,
    });
  };

  for (const [index, pose] of posesToUpload.entries()) {
    const original = params.photos[pose];
    if (!original) {
      return { ok: false, error: { message: `Missing ${pose} photo.`, reason: "upload_failed" } };
    }
    options?.onPhotoState?.({ pose, status: "preparing" });
    const startedAt = Date.now();
    try {
      const processed = await prepareScanPhoto(original, pose);
      uploadTargets = uploadTargets.map((target) =>
        target.pose === pose
          ? { ...target, file: processed.preparedFile, size: processed.meta.prepared.size }
          : target
      );
      totalBytes = uploadTargets.reduce((sum, target) => sum + target.size, 0);
      options?.onPhotoState?.({
        pose,
        status: "preparing",
        original: processed.meta.original,
        compressed: processed.meta.prepared,
        preprocessDebug: processed.meta.debug,
      });
      completedSteps += 1;
      emitProgress(pose, "preparing", index, posesToUpload.length, 1, true);
      console.info("scan.preprocess", {
        pose,
        inBytes: processed.meta.original.size,
        outBytes: processed.meta.prepared.size,
        ms: Date.now() - startedAt,
      });
    } catch (err) {
      options?.onPhotoState?.({
        pose,
        status: "failed",
        message: "Couldn’t prepare photo on this device",
      });
      const e: any = new Error("Couldn’t prepare photo on this device");
      e.code = "preprocess_failed";
      e.pose = pose;
      return { ok: false, error: buildScanError(e, e.message, "upload_failed") };
    }
  }

  const controller = new AbortController();
  const overallTimeoutMs =
    typeof options?.overallTimeoutMs === "number" && Number.isFinite(options.overallTimeoutMs)
      ? Math.max(30_000, options.overallTimeoutMs)
      : 120_000;
  const stallTimeoutMs =
    typeof options?.stallTimeoutMs === "number" && Number.isFinite(options.stallTimeoutMs)
      ? Math.max(1_000, options.stallTimeoutMs)
      : 10_000;
  const perPhotoTimeoutMs =
    typeof options?.perPhotoTimeoutMs === "number" && Number.isFinite(options.perPhotoTimeoutMs)
      ? Math.max(20_000, options.perPhotoTimeoutMs)
      : 90_000;
  const timeoutId = setTimeout(() => controller.abort(), overallTimeoutMs);
  if (options?.signal) {
    if (options.signal.aborted) controller.abort();
    else options.signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  const maxAttempts = 4;
  const activeTargets = posesToUpload.length
    ? uploadTargets.filter((target) => posesToUpload.includes(target.pose))
    : [];
  totalBytes = activeTargets.reduce((sum, target) => sum + target.size, 0);
  const poseProgress: Record<keyof StartScanResponse["storagePaths"], number> = {
    front: 0,
    back: 0,
    left: 0,
    right: 0,
  };
  const poseByteSizes: Record<keyof StartScanResponse["storagePaths"], number> = {
    front: 0,
    back: 0,
    left: 0,
    right: 0,
  };
  for (const target of activeTargets) {
    poseByteSizes[target.pose] = target.size ?? 0;
  }
  let hasBytesTransferred = false;

  const emitOverallProgress = (pose: keyof StartScanResponse["storagePaths"], hasBytes: boolean) => {
    const aggregateBytes = activeTargets.reduce((sum, target) => {
      const fraction = poseProgress[target.pose] || 0;
      return sum + target.size * fraction;
    }, 0);
    const total = totalBytes > 0 ? totalBytes : 1;
    const overallPercent = ensureVisibleProgress(
      aggregateBytes / total,
      hasBytesTransferred || hasBytes
    );
    const posePercent = ensureVisibleProgress(poseProgress[pose] ?? 0, hasBytesTransferred || hasBytes);
    const poseBytes = (poseProgress[pose] ?? 0) * (poseByteSizes[pose] || 0);
    const poseTotalBytes = poseByteSizes[pose] || 1;
    options?.onUploadProgress?.({
      pose,
      fileIndex: posesToUpload.indexOf(pose),
      fileCount: posesToUpload.length,
      bytesTransferred: poseBytes,
      totalBytes: poseTotalBytes,
      percent: posePercent,
      overallPercent,
      hasBytesTransferred: hasBytesTransferred || hasBytes,
      status: "uploading",
      attempt: 1,
    });
  };

  const debugSimulateFreeze = (() => {
    try {
      return typeof window !== "undefined" &&
        window.localStorage.getItem("mbs.debug.freezeUpload") === "1";
    } catch {
      return false;
    }
  })();

  const uploadPose = async (pose: keyof StartScanResponse["storagePaths"]): Promise<void> => {
    const target = activeTargets.find((t) => t.pose === pose);
    if (!target) {
      throw new Error(`Missing ${pose} upload target`);
    }
    let attempt = 0;
    let lastBytes = 0;
    let lastError: any = null;

    while (attempt < maxAttempts) {
      attempt += 1;
      options?.onPhotoState?.({
        pose,
        status: attempt > 1 ? "retrying" : "uploading",
        attempt,
        correlationId: scanCorrelationId,
        uploadMethod: "storage",
      });
      try {
        const startedAt = Date.now();
        const result = await uploadPhoto({
          uid: user.uid,
          scanId: params.scanId,
          pose,
          file: target.file,
          correlationId: scanCorrelationId,
          customMetadata: {
            correlationId: scanCorrelationId,
            scanId: params.scanId,
            pose,
          },
          signal: controller.signal,
          storageTimeoutMs: perPhotoTimeoutMs,
          stallTimeoutMs,
          onProgress: (progress) => {
            lastBytes = progress.bytesTransferred;
            const fraction =
              progress.totalBytes > 0 ? progress.bytesTransferred / progress.totalBytes : 0;
            poseProgress[pose] = ensureVisibleProgress(fraction, progress.bytesTransferred > 0);
            hasBytesTransferred = hasBytesTransferred || progress.bytesTransferred > 0;
            options?.onPhotoState?.({
              pose,
              status: "uploading",
              percent: poseProgress[pose],
              bytesTransferred: progress.bytesTransferred,
              totalBytes: progress.totalBytes,
              taskState: progress.taskState,
              lastProgressAt: progress.lastProgressAt,
              correlationId: scanCorrelationId,
              uploadMethod: "storage",
            });
            emitOverallProgress(pose, progress.bytesTransferred > 0);
          },
          debugSimulateFreeze,
        });
        const elapsedMs = Date.now() - startedAt;
        poseProgress[pose] = 1;
        emitOverallProgress(pose, true);
        options?.onPhotoState?.({
          pose,
          status: "done",
          percent: 1,
          correlationId: scanCorrelationId,
          uploadMethod: result.method,
          elapsedMs,
        });
        return;
      } catch (err: any) {
        lastError = err;
        if (controller.signal.aborted) throw err;
        const retry = classifyUploadRetryability({
          code: err?.code,
          bytesTransferred: lastBytes,
          wasOffline: err?.wasOffline,
        });
        if (retry.retryable && attempt < maxAttempts) {
          const delayMs = Math.min(1000 * attempt, 3000);
          options?.onPhotoState?.({
            pose,
            status: "retrying",
            attempt: attempt + 1,
            percent: poseProgress[pose],
            message: retry.reason === "transient_network"
              ? "Network issue, retrying…"
              : "Retrying upload…",
            nextRetryDelayMs: delayMs,
            correlationId: scanCorrelationId,
            uploadMethod: "storage",
          });
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }
        options?.onPhotoState?.({
          pose,
          status: "failed",
          percent: poseProgress[pose],
          message:
            typeof err?.message === "string" && err.message.length
              ? err.message
              : "Upload failed.",
          correlationId: scanCorrelationId,
          uploadMethod: "storage",
          lastUploadError: { code: err?.code, message: err?.message },
        } as any);
        throw err;
      }
    }
    throw lastError ?? new Error("Upload failed");
  };

  try {
    try {
      if (typeof window !== "undefined") {
        const mod = await import("@/lib/scanPipeline");
        mod.updateScanPipelineState(params.scanId, { uploadStrategy: "storage" } as any);
      }
    } catch {
      // ignore
    }
    if (posesToUpload.length) {
      const queue = [...posesToUpload];
      // Safari (iOS) is the most sensitive to concurrent uploads; default to 1.
      const configuredConcurrency =
        typeof options?.maxConcurrentUploads === "number" && Number.isFinite(options.maxConcurrentUploads)
          ? Math.max(1, Math.floor(options.maxConcurrentUploads))
          : isIOSSafari()
            ? 1
            : 2;
      const maxConcurrentUploads = Math.min(configuredConcurrency, posesToUpload.length);
      const workers = Array.from({ length: maxConcurrentUploads }).map(async () => {
        while (queue.length > 0) {
          const next = queue.shift();
          if (next) {
            await uploadPose(next);
          }
        }
      });
      await Promise.all(workers);
    }
  } catch (err: any) {
    clearTimeout(timeoutId);
    const timedOut = controller.signal.aborted;
    if (timedOut) {
      return {
        ok: false,
        error: {
          code: "scan/overall-timeout",
          message: "This scan is taking too long. Please retry.",
          reason: "upload_failed",
        },
      };
    }
    const fallback = "Could not upload your photos. Please try again.";
    return {
      ok: false,
      error: buildScanError(err, fallback, "upload_failed"),
    };
  }

  if (controller.signal.aborted) {
    clearTimeout(timeoutId);
    return {
      ok: false,
      error: {
        code: "scan/overall-timeout",
        message: "This scan is taking too long. Please retry.",
        reason: "upload_failed",
      },
    };
  }

  try {
    const response = await apiFetch<SubmitScanResponse>(submitUrl(), {
      method: "POST",
      retries: 0,
      timeoutMs: 30_000,
      signal: controller.signal,
      body: {
        scanId: params.scanId,
        photoPaths: params.storagePaths,
        currentWeightKg: params.currentWeightKg,
        goalWeightKg: params.goalWeightKg,
        correlationId: scanCorrelationId,
      },
      headers: {
        "X-Correlation-Id": scanCorrelationId,
      },
    });
    clearTimeout(timeoutId);
    return {
      ok: true,
      data: response ?? { scanId: params.scanId, correlationId: scanCorrelationId },
    };
  } catch (err) {
    clearTimeout(timeoutId);
    return {
      ok: false,
      error: buildScanError(err, "We couldn't start analysis right now.", "submit_failed"),
    };
  }
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
