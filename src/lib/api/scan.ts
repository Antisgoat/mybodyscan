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
import {
  preprocessImageForUpload,
  type UploadPreprocessMeta,
  type UploadPreprocessResult,
} from "@/features/scan/resizeImage";
import {
  ref,
  uploadBytesResumable,
  getDownloadURL,
  type UploadTaskSnapshot,
  type UploadTask,
} from "firebase/storage";

export type ScanEstimate = {
  bodyFatPercent: number;
  bmi: number | null;
  notes: string;
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
    | "pending"
    | "processing"
    | "complete"
    | "completed"
    | "failed"
    | "error";
  errorMessage?: string | null;
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
  return {
    id,
    uid,
    createdAt: parseTimestamp(data.createdAt),
    updatedAt: parseTimestamp(data.updatedAt),
    completedAt: completedAtRaw ? parseTimestamp(completedAtRaw) : null,
    status: (data.status as ScanDocument["status"]) ?? "pending",
    errorMessage:
      typeof data.errorMessage === "string" ? data.errorMessage : null,
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

export async function startScanSessionClient(params: {
  currentWeightKg: number;
  goalWeightKg: number;
}): Promise<ScanApiResult<StartScanResponse>> {
  const user = auth.currentUser;
  if (!user)
    return {
      ok: false,
      error: { message: "Please sign in before starting a scan." },
    };
  try {
    const data = await apiFetch<StartScanResponse>(startUrl(), {
      method: "POST",
      body: {
        currentWeightKg: params.currentWeightKg,
        goalWeightKg: params.goalWeightKg,
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

async function uploadPhoto(
  path: string,
  file: File,
  onProgress?: (snapshot: UploadTaskSnapshot) => void,
  options?: {
    signal?: AbortSignal;
    stallTimeoutMs?: number;
    onStall?: (details: { reason: "no_progress" | "stalled"; bytesTransferred: number }) => void;
    onTask?: (task: UploadTask) => void;
  }
): Promise<void> {
  const storageRef = ref(storage, path);
  await new Promise<void>((resolve, reject) => {
    const task = uploadBytesResumable(storageRef, file, {
      contentType: file.type || "image/jpeg",
    });
    options?.onTask?.(task);
    let settled = false;
    let lastBytes = 0;
    let lastBytesAt = Date.now();

    const stallTimeoutMs = options?.stallTimeoutMs ?? 15_000;
    const stallTimer =
      stallTimeoutMs > 0
        ? setInterval(() => {
            if (settled) return;
            const reason = getUploadStallReason({
              lastBytes,
              lastBytesAt,
              now: Date.now(),
              stallTimeoutMs,
            });
            if (!reason) return;
            try {
              options?.onStall?.({
                reason,
                bytesTransferred: lastBytes,
              });
            } catch {
              // ignore
            }
            try {
              task.cancel();
            } catch {
              // ignore
            }
            const err: any = new Error("Upload stalled. Please retry.");
            err.code = "upload_stalled";
            settled = true;
            clearInterval(stallTimer);
            reject(err);
          }, 1000)
        : null;

    const abortHandler = () => {
      if (settled) return;
      try {
        task.cancel();
      } catch {
        // ignore
      }
      const err: any = new Error("Upload cancelled.");
      err.code = "upload_cancelled";
      settled = true;
      if (stallTimer) clearInterval(stallTimer);
      reject(err);
    };

    if (options?.signal) {
      if (options.signal.aborted) {
        abortHandler();
        return;
      }
      options.signal.addEventListener("abort", abortHandler, { once: true });
    }

    const resumeIfPaused = () => {
      try {
        task.resume();
      } catch {
        // ignore
      }
    };
    const onVis = () => {
      if (document.visibilityState === "visible") {
        resumeIfPaused();
      }
    };
    const onOnline = () => resumeIfPaused();
    try {
      document.addEventListener("visibilitychange", onVis);
      window.addEventListener("online", onOnline);
    } catch {
      // ignore
    }

    task.on(
      "state_changed",
      (snapshot) => {
        const bytes = Math.max(0, snapshot.bytesTransferred || 0);
        if (bytes !== lastBytes) {
          lastBytes = bytes;
          lastBytesAt = Date.now();
        }
        // If the task gets paused (common on mobile during network/visibility hiccups),
        // proactively resume so the user doesn't have to manually intervene.
        if (snapshot.state === "paused") {
          try {
            task.resume();
          } catch {
            // ignore
          }
        }
        onProgress?.(snapshot);
      },
      (error) => {
        settled = true;
        if (stallTimer) clearInterval(stallTimer);
        if (options?.signal) {
          try {
            options.signal.removeEventListener("abort", abortHandler);
          } catch {
            // ignore
          }
        }
        try {
          document.removeEventListener("visibilitychange", onVis);
          window.removeEventListener("online", onOnline);
        } catch {
          // ignore
        }
        reject(error);
      },
      () => {
        settled = true;
        if (stallTimer) clearInterval(stallTimer);
        if (options?.signal) {
          try {
            options.signal.removeEventListener("abort", abortHandler);
          } catch {
            // ignore
          }
        }
        try {
          document.removeEventListener("visibilitychange", onVis);
          window.removeEventListener("online", onOnline);
        } catch {
          // ignore
        }
        resolve();
      }
    );
  });
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

export function getUploadStallReason(params: {
  lastBytes: number;
  lastBytesAt: number;
  now: number;
  stallTimeoutMs: number;
}): "no_progress" | "stalled" | null {
  const stallTimeoutMs = Number(params.stallTimeoutMs);
  if (!Number.isFinite(stallTimeoutMs) || stallTimeoutMs <= 0) return null;
  const elapsed = params.now - params.lastBytesAt;
  if (!Number.isFinite(elapsed) || elapsed < stallTimeoutMs) return null;
  return params.lastBytes > 0 ? "stalled" : "no_progress";
}

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
  if (code === "upload_stalled") {
    return {
      code,
      message: pose ? `${pose} upload stalled. Please retry.` : "Upload stalled. Please retry.",
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
  if (code.startsWith("storage/")) {
    const message =
      code === "storage/unauthorized"
        ? "Upload blocked (unauthorized). Please sign in again and retry."
        : code === "storage/canceled"
          ? "Upload cancelled. Please retry."
          : code === "storage/retry-limit-exceeded"
            ? "Upload failed after retries. Check your connection and try again."
            : "Upload failed. Please check your connection and retry.";
    return {
      code,
      message: pose ? `${pose} upload failed. ${message}` : message,
      reason: "upload_failed",
      pose,
    };
  }
  return null;
}

export async function submitScanClient(
  params: {
    scanId: string;
    storagePaths: { front: string; back: string; left: string; right: string };
    photos: { front: File; back: File; left: File; right: File };
    currentWeightKg: number;
    goalWeightKg: number;
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
    }) => void;
    signal?: AbortSignal;
    stallTimeoutMs?: number;
    posesToUpload?: Array<keyof StartScanResponse["storagePaths"]>;
  }
): Promise<ScanApiResult<void>> {
  const user = auth.currentUser;
  if (!user)
    return {
      ok: false,
      error: { message: "Please sign in before submitting a scan." },
    };
  let uploadsCompleted = false;
  try {
    const orderedPoses: Array<keyof StartScanResponse["storagePaths"]> = [
      "front",
      "back",
      "left",
      "right",
    ];
    const posesToUpload = options?.posesToUpload?.length
      ? orderedPoses.filter((p) => options.posesToUpload!.includes(p))
      : orderedPoses;

    // Preprocess photos (mandatory): ALWAYS produce a JPEG File (never fall back to original).
    // This prevents iPhone Safari from uploading huge PNGs when canvas/toBlob fails.
    const photos = { ...params.photos } as typeof params.photos;
    for (const pose of posesToUpload) {
      const original = params.photos[pose];
      options?.onPhotoState?.({ pose, status: "preparing" });
      const t0 = Date.now();
      try {
        const processed = await preprocessImageForUpload(original, {
          fileName: `${pose}.jpg`,
          maxEdgeDesktop: 1800,
          maxEdgeMobileSafari: 1280,
          jpegQualityStart: 0.8,
          outputBytesLimit: Math.round(2.5 * 1024 * 1024),
        });
        const t1 = Date.now();
        console.info("scan.preprocess", {
          pose,
          inBytes: processed.original.size,
          outBytes: processed.compressed.size,
          ms: t1 - t0,
          inType: processed.original.type,
          outType: processed.compressed.type,
          maxEdge: processed.debug.maxEdgeFinal,
          quality: processed.debug.qualityFinal,
        });
        photos[pose] = processed.file;
        options?.onPhotoState?.({
          pose,
          status: "preparing",
          original: processed.original,
          compressed: processed.compressed,
          preprocessDebug: processed.debug,
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
          message:
            (err as Error)?.message ||
            "Could not compress this photo for upload. Please retry.",
        });
        const e: any = new Error(
          (err as Error)?.message ||
            "Could not compress this photo for upload. Please retry."
        );
        e.code = "preprocess_failed";
        e.pose = pose;
        throw e;
      }
    }

    const validated = validateScanUploadInputs({
      storagePaths: params.storagePaths,
      photos,
    });
    if (!validated.ok) return validated;
    const uploadTargetsAll = validated.data.uploadTargets;
    const uploadTargets = uploadTargetsAll.filter((t) =>
      posesToUpload.includes(t.pose)
    );
    if (!uploadTargets.length) {
      // Nothing to upload (e.g. retry invoked with empty pose list)
      uploadsCompleted = true;
    }

    const fileCount = uploadTargets.length;
    const totalBytes = validated.data.totalBytes;
    const safeTotalBytes = totalBytes > 0 ? totalBytes : fileCount;
    const fallbackDenominator = fileCount || 1;
    let uploadedBytes = 0;

    const stallTimeoutMs = options?.stallTimeoutMs ?? 15_000;
    const retryDelaysMs = [1000, 2000, 4000];

    for (const [index, target] of uploadTargets.entries()) {
      let attempt = 0;
      let succeeded = false;
      while (!succeeded && attempt < 3) {
        attempt += 1;
        const isRetry = attempt > 1;
        options?.onPhotoState?.({
          pose: target.pose,
          status: isRetry ? "retrying" : "uploading",
          attempt,
        });
        console.info("scan.upload_attempt", {
          pose: target.pose,
          attempt,
          path: target.path,
          bytes: target.file.size,
        });

        let lastSnapshot: UploadTaskSnapshot | null = null;
        try {
          await uploadPhoto(
            target.path,
            target.file,
            (snapshot) => {
              lastSnapshot = snapshot;
              const snapshotTotal = snapshot.totalBytes || target.size || 1;
              const snapshotBytes = snapshot.bytesTransferred || 0;
              const hasTransferred =
                snapshotBytes > 0 ||
                snapshot.state === "running" ||
                snapshot.state === "paused";
              const filePercent = ensureVisibleProgress(
                snapshotTotal > 0 ? snapshotBytes / snapshotTotal : 0,
                hasTransferred
              );
              const bytesBasis =
                safeTotalBytes > 0
                  ? (uploadedBytes + snapshotBytes) / safeTotalBytes
                  : (index + filePercent) / fallbackDenominator;
              const overallPercent = ensureVisibleProgress(
                bytesBasis,
                hasTransferred
              );
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
              });
            },
            {
              signal: options?.signal,
              stallTimeoutMs,
              onStall: ({ reason, bytesTransferred }) => {
                console.warn("scan.upload_stall", {
                  pose: target.pose,
                  attempt,
                  reason,
                  bytesTransferred,
                });
                options?.onPhotoState?.({
                  pose: target.pose,
                  status: "retrying",
                  attempt,
                  message:
                    reason === "no_progress"
                      ? "Upload stalled (no progress for 15s). Restarting…"
                      : "Upload stalled (no new bytes for 15s). Restarting…",
                });
              },
            }
          );
          succeeded = true;
        } catch (err) {
          const normalized = normalizeUploadError(err);
          console.warn("scan.upload_failed", {
            pose: target.pose,
            attempt,
            code: (err as any)?.code,
            message: (err as Error)?.message,
            normalizedCode: normalized?.code,
            state: lastSnapshot?.state,
          });
          if (attempt < 3) {
            const backoff = retryDelaysMs[attempt - 1] ?? 2000;
            options?.onPhotoState?.({
              pose: target.pose,
              status: "retrying",
              attempt,
              message: "Retrying upload…",
            });
            await new Promise((r) => setTimeout(r, backoff));
            continue;
          }
          options?.onPhotoState?.({
            pose: target.pose,
            status: "failed",
            attempt,
            message: normalized?.message ?? "Upload failed.",
          });
          const finalErr: any = normalized
            ? Object.assign(new Error(normalized.message), {
                code: normalized.code,
              })
            : err;
          // Attach pose so the UI can say exactly which photo failed/stalled.
          finalErr.pose = target.pose;
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
    // `submitScan` performs the full OpenAI analysis server-side and can take
    // longer than the default 15s API timeout on mobile networks (especially iOS Safari).
    // Use a longer timeout and avoid client retries that could duplicate work.
    await apiFetch(submitUrl(), {
      method: "POST",
      timeoutMs: 180_000,
      retries: 0,
      body: {
        scanId: params.scanId,
        photoPaths: params.storagePaths,
        currentWeightKg: params.currentWeightKg,
        goalWeightKg: params.goalWeightKg,
      },
    });
    return { ok: true, data: undefined };
  } catch (err) {
    console.error("scan:submit error", err);
    const reason = uploadsCompleted ? "submit_failed" : "upload_failed";
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
