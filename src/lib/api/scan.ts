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
import type { UploadMethod } from "@/lib/uploads/uploadPhoto";
import { getScanPhotoPath } from "@/lib/uploads/storagePaths";

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
  uploadedPoses?: {
    front?: boolean;
    back?: boolean;
    left?: boolean;
    right?: boolean;
  } | null;
  weights?: {
    current?: number | null;
    goal?: number | null;
    unit?: string | null;
  } | null;
  /**
   * Optional richer photo refs (derived server-side from canonical `photoPaths`).
   * Uses Firebase Storage download tokens (NOT signed URLs).
   */
  photoObjects?: {
    front: { bucket: string; path: string; downloadURL?: string | null };
    back: { bucket: string; path: string; downloadURL?: string | null };
    left: { bucket: string; path: string; downloadURL?: string | null };
    right: { bucket: string; path: string; downloadURL?: string | null };
  } | null;
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
  status?: string;
  uploadedPoses?: Record<keyof StartScanResponse["storagePaths"], boolean>;
};

function startUrl(): string {
  const override = (import.meta as any).env?.VITE_SCAN_START_URL;
  if (typeof override === "string" && override.trim()) return override.trim();
  // Prefer same-origin Hosting rewrite (Safari/CORS reliability).
  return "/api/scan/start";
}

function submitUrl(): string {
  const override = (import.meta as any).env?.VITE_SCAN_SUBMIT_URL;
  if (typeof override === "string" && override.trim()) return override.trim();
  return "/api/scan/submit";
}

function deleteUrl(): string {
  const override = (import.meta as any).env?.VITE_SCAN_DELETE_URL;
  if (typeof override === "string" && override.trim()) return override.trim();
  return "/api/scan/delete";
}

function uploadUrl(): string {
  const override = (import.meta as any).env?.VITE_SCAN_UPLOAD_URL;
  if (typeof override === "string" && override.trim()) return override.trim();
  return "/api/scan/upload";
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
    uploadedPoses:
      data && typeof (data as any).uploadedPoses === "object"
        ? {
            front: Boolean((data as any).uploadedPoses.front),
            back: Boolean((data as any).uploadedPoses.back),
            left: Boolean((data as any).uploadedPoses.left),
            right: Boolean((data as any).uploadedPoses.right),
          }
        : null,
    weights:
      data && typeof (data as any).weights === "object"
        ? {
            current:
              typeof (data as any).weights.current === "number"
                ? ((data as any).weights.current as number)
                : null,
            goal:
              typeof (data as any).weights.goal === "number"
                ? ((data as any).weights.goal as number)
                : null,
            unit:
              typeof (data as any).weights.unit === "string"
                ? ((data as any).weights.unit as string)
                : null,
          }
        : null,
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
  uid: string;
  scanId: string;
  photos: { front: File; back: File; left: File; right: File };
}): ScanApiResult<{
  uploadTargets: UploadTarget[];
  totalBytes: number;
}> {
  const uid = String(params.uid || "").trim();
  const scanId = String(params.scanId || "").trim();
  if (!uid || !scanId) {
    return { ok: false, error: { message: "Missing scan session info.", reason: "upload_failed" } };
  }
  const entries = (["front", "back", "left", "right"] as const).map((pose) => [
    pose,
    getScanPhotoPath(uid, scanId, pose),
  ]) as Array<[keyof StartScanResponse["storagePaths"], string]>;
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

function ensureJpegFile(file: File, pose: string): File {
  const type = (file.type || "").toLowerCase();
  if (type === SCAN_UPLOAD_CONTENT_TYPE) return file;
  const name = file.name && file.name.trim().length ? file.name : `${pose}.jpg`;
  return new File([file], name, { type: SCAN_UPLOAD_CONTENT_TYPE });
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
      taskState?: "running" | "paused" | "success" | "canceled" | "error";
      lastProgressAt?: number;
      correlationId?: string;
      downloadURL?: string;
      uploadMethod?: UploadMethod | "function";
      nextRetryDelayMs?: number;
      lastUploadError?: { code?: string; message?: string };
      elapsedMs?: number;
    }) => void;
    signal?: AbortSignal;
    posesToUpload?: Array<keyof StartScanResponse["storagePaths"]>;
    overallTimeoutMs?: number;
    stallTimeoutMs?: number;
    perPhotoTimeoutMs?: number;
  }
): Promise<ScanApiResult<SubmitScanResponse>> {
  const user = auth.currentUser;
  if (!user)
    return {
      ok: false,
      error: { message: "Please sign in before submitting a scan." },
    };
  const poses: Array<keyof StartScanResponse["storagePaths"]> = [
    "front",
    "back",
    "left",
    "right",
  ];
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

  const validated = validateScanUploadInputs({
    uid: user.uid,
    scanId: params.scanId,
    photos: params.photos,
  });
  if (!validated.ok) {
    return { ok: false, error: validated.error };
  }

  const perPhotoPrepTimeoutMs =
    typeof options?.perPhotoTimeoutMs === "number" &&
    Number.isFinite(options.perPhotoTimeoutMs)
      ? Math.max(2500, Math.min(options.perPhotoTimeoutMs, 8000))
      : 3500;
  const uploadTimeoutMs =
    typeof options?.perPhotoTimeoutMs === "number" &&
    Number.isFinite(options.perPhotoTimeoutMs)
      ? Math.max(30_000, options.perPhotoTimeoutMs)
      : 90_000;
  const stallTimeoutMs =
    typeof options?.stallTimeoutMs === "number" &&
    Number.isFinite(options?.stallTimeoutMs)
      ? Math.max(1500, options.stallTimeoutMs)
      : 10_000;
  const overallTimeoutMs =
    typeof options?.overallTimeoutMs === "number" &&
    Number.isFinite(options.overallTimeoutMs)
      ? Math.max(45_000, options.overallTimeoutMs)
      : 150_000;
  const controller = new AbortController();
  const overallTimer = setTimeout(() => controller.abort(), overallTimeoutMs);
  if (options?.signal) {
    if (options.signal.aborted) controller.abort();
    else options.signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  const poseProgress: Record<keyof StartScanResponse["storagePaths"], number> = {
    front: 0,
    back: 0,
    left: 0,
    right: 0,
  };
  const totalSteps = poses.length + 1;
  let completedSteps = 0;

  const emitProgress = (
    pose: keyof StartScanResponse["storagePaths"],
    percent: number,
    status: ScanUploadProgress["status"],
    hasBytes: boolean
  ) => {
    poseProgress[pose] = Math.max(poseProgress[pose], percent);
    const aggregate = poses.reduce((sum, p) => sum + (poseProgress[p] ?? 0), 0);
    options?.onUploadProgress?.({
      pose,
      fileIndex: poses.indexOf(pose),
      fileCount: poses.length,
      bytesTransferred: percent,
      totalBytes: 1,
      percent,
      overallPercent: ensureVisibleProgress(
        (completedSteps + aggregate / poses.length) / totalSteps,
        hasBytes
      ),
      hasBytesTransferred: hasBytes,
      status,
      attempt: 1,
    });
  };

  type Prepared = {
    file: File;
    meta: {
      original: UploadPreprocessMeta;
      prepared: UploadPreprocessMeta;
      debug?: UploadPreprocessResult["debug"];
    };
  };
  const preparedFiles: Record<keyof StartScanResponse["storagePaths"], Prepared> = {
    front: null as any,
    back: null as any,
    left: null as any,
    right: null as any,
  };

  for (const pose of poses) {
    const original = params.photos[pose];
    if (!original) {
      clearTimeout(overallTimer);
      return { ok: false, error: { message: `Missing ${pose} photo.`, reason: "upload_failed" } };
    }
    options?.onPhotoState?.({ pose, status: "preparing" });
    const startedAt = Date.now();
    try {
      const prepResult = await Promise.race([
        prepareScanPhoto(original, pose),
        new Promise<null>((resolve) =>
          setTimeout(() => resolve(null), perPhotoPrepTimeoutMs)
        ),
      ]);
      if (prepResult) {
        preparedFiles[pose] = {
          file: prepResult.preparedFile,
          meta: {
            original: prepResult.meta.original,
            prepared: prepResult.meta.prepared,
            debug: prepResult.meta.debug,
          },
        };
        options?.onPhotoState?.({
          pose,
          status: "preparing",
          original: prepResult.meta.original,
          compressed: prepResult.meta.prepared,
          preprocessDebug: prepResult.meta.debug,
        });
      } else {
        const fallbackFile = ensureJpegFile(original, pose);
        const meta = {
          name: fallbackFile.name || `${pose}.jpg`,
          size: fallbackFile.size,
          type: fallbackFile.type || "image/jpeg",
        };
        preparedFiles[pose] = {
          file: fallbackFile,
          meta: { original: meta, prepared: meta },
        };
        options?.onPhotoState?.({ pose, status: "preparing", original: meta, compressed: meta });
      }
      completedSteps += 1;
      emitProgress(pose, 1, "preparing", true);
      console.info("scan.preprocess", {
        pose,
        ms: Date.now() - startedAt,
        size: preparedFiles[pose].file.size,
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
      clearTimeout(overallTimer);
      return { ok: false, error: buildScanError(e, e.message, "upload_failed") };
    }
  }

  const form = new FormData();
  form.append("scanId", params.scanId);
  form.append("currentWeight", String(params.currentWeightKg));
  form.append("goalWeight", String(params.goalWeightKg));
  form.append("unit", "kg");
  form.append("correlationId", scanCorrelationId);
  for (const pose of poses) {
    const prepared = preparedFiles[pose];
    const namedFile =
      prepared.file.name && prepared.file.name.trim().length
        ? prepared.file
        : new File([prepared.file], `${pose}.jpg`, {
            type: prepared.file.type || "image/jpeg",
          });
    form.append(pose, namedFile, `${pose}.jpg`);
  }

  const maxAttempts = 3;
  let attempt = 0;
  let lastError: any = null;

  while (attempt < maxAttempts) {
    attempt += 1;
    const attemptController = new AbortController();
    const abortAttempt = () => attemptController.abort();
    if (controller.signal.aborted) {
      clearTimeout(overallTimer);
      return {
        ok: false,
        error: {
          code: "scan/overall-timeout",
          message: "This scan is taking too long. Please retry.",
          reason: "upload_failed",
        },
      };
    }
    controller.signal.addEventListener("abort", abortAttempt, { once: true });
    const attemptTimer = setTimeout(() => attemptController.abort(), uploadTimeoutMs);
    const startedAt = Date.now();
    poses.forEach((pose) => {
      options?.onPhotoState?.({
        pose,
        status: attempt > 1 ? "retrying" : "uploading",
        attempt,
        percent: poseProgress[pose] ?? 0,
        correlationId: scanCorrelationId,
      });
    });
    const heartbeat = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const fraction = ensureVisibleProgress(
        Math.min(0.95, elapsed / Math.max(uploadTimeoutMs, stallTimeoutMs)),
        true
      );
      poses.forEach((pose) => emitProgress(pose, fraction, "uploading", true));
    }, 900);
    try {
      const response = await apiFetch<SubmitScanResponse>(uploadUrl(), {
        method: "POST",
        retries: 0,
        timeoutMs: uploadTimeoutMs,
        expectJson: true,
        signal: attemptController.signal,
        headers: {
          "X-Correlation-Id": scanCorrelationId,
          "X-Scan-Id": params.scanId,
        },
        body: form,
      });
      clearInterval(heartbeat);
      clearTimeout(attemptTimer);
      controller.signal.removeEventListener("abort", abortAttempt);
      poses.forEach((pose) => emitProgress(pose, 1, "done", true));
      poses.forEach((pose) =>
        options?.onPhotoState?.({
          pose,
          status: "done",
          percent: 1,
          correlationId: scanCorrelationId,
          uploadMethod: "function",
          elapsedMs: Date.now() - startedAt,
        })
      );
      clearTimeout(overallTimer);
      return {
        ok: true,
        data: {
          ...(response ?? {}),
          scanId: response?.scanId ?? params.scanId,
          correlationId: response?.correlationId ?? scanCorrelationId,
        },
      };
    } catch (err: any) {
      clearInterval(heartbeat);
      clearTimeout(attemptTimer);
      controller.signal.removeEventListener("abort", abortAttempt);
      lastError = err;
      const aborted = attemptController.signal.aborted || controller.signal.aborted;
      if (aborted) {
        clearTimeout(overallTimer);
        return {
          ok: false,
          error: {
            code: "scan/overall-timeout",
            message: "This scan is taking too long. Please retry.",
            reason: "upload_failed",
          },
        };
      }
      const status =
        err instanceof ApiError
          ? err.status
          : typeof err?.status === "number"
            ? (err.status as number)
            : 0;
      const retryable =
        [0, 429, 500, 502, 503, 504].includes(status) || err?.name === "AbortError";
      if (retryable && attempt < maxAttempts) {
        const delayMs = Math.min(2500 * attempt, 6000);
        poses.forEach((pose) =>
          options?.onPhotoState?.({
            pose,
            status: "retrying",
            attempt: attempt + 1,
            percent: poseProgress[pose] ?? 0.1,
            correlationId: scanCorrelationId,
            nextRetryDelayMs: delayMs,
          })
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }
      clearTimeout(overallTimer);
      return {
        ok: false,
        error: buildScanError(
          err,
          "Could not upload your photos. Please try again.",
          "upload_failed"
        ),
      };
    }
  }

  clearTimeout(overallTimer);
  return {
    ok: false,
    error: buildScanError(
      lastError,
      "Could not upload your photos. Please try again.",
      "upload_failed"
    ),
  };
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
