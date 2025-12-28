/**
 * Pipeline map — Client scan API bridge:
 * - Starts scan sessions (`startScanSessionClient`) so Firestore creates a pending doc + storage paths.
 * - Streams uploads via Firebase Storage, emitting `ScanUploadProgress` so the UI can avoid 0% stalls.
 * - Submits metadata to the HTTPS function, handles cleanup (`deleteScanApi`), and fetches Firestore results.
 */
import { apiFetch, ApiError } from "@/lib/http";
import { auth, db, storage } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import {
  prepareScanPhoto,
  type UploadPreprocessMeta,
  type UploadPreprocessResult,
} from "@/features/scan/resizeImage";
import { uploadPhoto, type UploadMethod } from "@/lib/uploads/uploadPhoto";
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
    heightCm?: number | null;
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
  const normalizedHeight =
    typeof input?.heightCm === "number" && Number.isFinite(input.heightCm)
      ? input.heightCm
      : typeof (data as any)?.heightCm === "number" && Number.isFinite((data as any).heightCm)
        ? ((data as any).heightCm as number)
        : typeof (data as any)?.height_cm === "number" && Number.isFinite((data as any).height_cm)
          ? ((data as any).height_cm as number)
          : undefined;
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
    input: {
      currentWeightKg:
        typeof input?.currentWeightKg === "number" && Number.isFinite(input.currentWeightKg)
          ? input.currentWeightKg
          : 0,
      goalWeightKg:
        typeof input?.goalWeightKg === "number" && Number.isFinite(input.goalWeightKg)
          ? input.goalWeightKg
          : 0,
      heightCm: normalizedHeight ?? null,
    },
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
    heightCm?: number;
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
        heightCm:
          typeof params.heightCm === "number" && Number.isFinite(params.heightCm)
            ? Math.round(params.heightCm)
            : undefined,
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
    heightCm?: number;
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
      fullPath?: string;
      bucket?: string;
      pathMismatch?: boolean;
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
  const posesToUpload =
    options?.posesToUpload && options.posesToUpload.length
      ? options.posesToUpload
      : poses;
  const scanCorrelationId =
    params.scanCorrelationId ?? createScanCorrelationId(params.scanId);
  if (params.heightCm == null) {
    console.warn("scan_submit_height_missing", {
      scanId: params.scanId,
      uid: user.uid,
    });
  }

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

  const canonicalPaths = poses.reduce(
    (acc, pose) => {
      const canonical = getScanPhotoPath(user.uid, params.scanId, pose);
      const provided = params.storagePaths?.[pose];
      const resolved = provided && provided.trim().length ? provided.trim() : canonical;
      const effective = resolved === canonical ? resolved : canonical;
      acc[pose] = { resolved: effective, canonical, mismatch: resolved !== canonical };
      if (resolved !== canonical) {
        options?.onPhotoState?.({
          pose,
          status: "preparing",
          pathMismatch: true,
        });
      }
      return acc;
    },
    {} as Record<
      keyof StartScanResponse["storagePaths"],
      { resolved: string; canonical: string; mismatch: boolean }
    >
  );

  type UploadTarget = {
    pose: keyof StartScanResponse["storagePaths"];
    path: string;
    file: File;
    size: number;
  };
  const uploadTargets: UploadTarget[] = posesToUpload.map((pose) => {
    const file = preparedFiles[pose]?.file;
    const size = Number.isFinite(file?.size) ? Number(file.size) : 0;
    return {
      pose,
      path: canonicalPaths[pose].resolved,
      file,
      size,
    };
  });
  const totalBytes = uploadTargets.reduce((sum, target) => sum + target.size, 0);
  const transferred: Record<keyof StartScanResponse["storagePaths"], number> = {
    front: 0,
    back: 0,
    left: 0,
    right: 0,
  };

  const emitProgress = (
    pose: keyof StartScanResponse["storagePaths"],
    bytesTransferred: number,
    totalBytesForPose: number,
    status: ScanUploadProgress["status"],
    hasBytes: boolean
  ) => {
    transferred[pose] = Math.max(transferred[pose], bytesTransferred);
    const totalTransferred = uploadTargets.reduce(
      (sum, target) => sum + (transferred[target.pose] ?? 0),
      0
    );
    const percent =
      totalBytesForPose > 0 ? clampProgressFraction(bytesTransferred / totalBytesForPose) : 0;
    const overallPercent =
      totalBytes > 0 ? clampProgressFraction(totalTransferred / totalBytes) : percent;
    options?.onUploadProgress?.({
      pose,
      fileIndex: Math.max(0, posesToUpload.indexOf(pose)),
      fileCount: posesToUpload.length || poses.length,
      bytesTransferred,
      totalBytes: totalBytesForPose,
      percent: ensureVisibleProgress(percent, hasBytes),
      overallPercent: ensureVisibleProgress(overallPercent, hasBytes),
      hasBytesTransferred: hasBytes,
      status,
      attempt: 1,
    });
  };

  const uploadedPaths: Record<
    keyof StartScanResponse["storagePaths"],
    { path: string; downloadURL?: string }
  > = {
    front: { path: canonicalPaths.front.resolved },
    back: { path: canonicalPaths.back.resolved },
    left: { path: canonicalPaths.left.resolved },
    right: { path: canonicalPaths.right.resolved },
  };

  try {
    for (const pose of posesToUpload) {
      const target = uploadTargets.find((t) => t.pose === pose);
      if (!target) continue;
      const totalForPose = target.size || preparedFiles[pose]?.file?.size || 1;
      emitProgress(pose, 0, totalForPose, "preparing", false);
    }

    for (const pose of posesToUpload) {
      const target = uploadTargets.find((t) => t.pose === pose);
      if (!target) continue;
      const totalForPose = target.size || target.file?.size || 1;
      options?.onPhotoState?.({
        pose,
        status: "uploading",
        attempt: 1,
        percent: 0,
        correlationId: scanCorrelationId,
        uploadMethod: "storage",
      });
      const result = await uploadPhoto({
        storage,
        path: target.path,
        file: target.file,
        uid: user.uid,
        scanId: params.scanId,
        pose,
        correlationId: scanCorrelationId,
        includeDownloadURL: true,
        customMetadata: {
          scanId: params.scanId,
          pose,
          uid: user.uid,
        },
        stallTimeoutMs,
        storageTimeoutMs: uploadTimeoutMs,
        signal: controller.signal,
        onProgress: (progress) => {
          const total = progress.totalBytes || totalForPose;
          emitProgress(
            pose,
            progress.bytesTransferred,
            total,
            "uploading",
            progress.bytesTransferred > 0
          );
          options?.onPhotoState?.({
            pose,
            status: "uploading",
            attempt: 1,
            percent: ensureVisibleProgress(
              total > 0 ? progress.bytesTransferred / total : 0,
              progress.bytesTransferred > 0
            ),
            correlationId: scanCorrelationId,
            bytesTransferred: progress.bytesTransferred,
            totalBytes: total,
            taskState: progress.taskState,
            lastProgressAt: progress.lastProgressAt,
            uploadMethod: "storage",
          });
        },
      });
      uploadedPaths[pose] = { path: result.storagePath, downloadURL: result.downloadURL };
      emitProgress(pose, totalForPose, totalForPose, "done", true);
      options?.onPhotoState?.({
        pose,
        status: "done",
        percent: 1,
        correlationId: scanCorrelationId,
        uploadMethod: result.method,
        downloadURL: result.downloadURL,
        elapsedMs: result.elapsedMs,
      });
    }
  } catch (err: any) {
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

  try {
    const response = await apiFetch<SubmitScanResponse>(submitUrl(), {
      method: "POST",
      retries: 0,
      timeoutMs: 30_000,
      body: {
        scanId: params.scanId,
        photoPaths: {
          front: uploadedPaths.front.path,
          back: uploadedPaths.back.path,
          left: uploadedPaths.left.path,
          right: uploadedPaths.right.path,
        },
        currentWeightKg: params.currentWeightKg,
        goalWeightKg: params.goalWeightKg,
        correlationId: scanCorrelationId,
        heightCm: params.heightCm,
      } as any,
    });
    clearTimeout(overallTimer);
    return {
      ok: true,
      data: {
        ...(response ?? {}),
        scanId: response?.scanId ?? params.scanId,
        correlationId: response?.correlationId ?? scanCorrelationId,
      },
    };
  } catch (err) {
    clearTimeout(overallTimer);
    return {
      ok: false,
      error: buildScanError(err, "Unable to start analysis. Please try again.", "submit_failed"),
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
    const heightCm =
      typeof input?.heightCm === "number" && Number.isFinite(input.heightCm)
        ? input.heightCm
        : typeof (data as any)?.heightCm === "number" && Number.isFinite((data as any).heightCm)
          ? ((data as any).heightCm as number)
          : null;
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
        heightCm: heightCm ?? undefined,
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
