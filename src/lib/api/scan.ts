/**
 * Pipeline map — Client scan API bridge:
 * - Starts scan sessions (`startScanSessionClient`) so Firestore creates a pending doc + storage paths.
 * - Streams uploads via Firebase Storage, emitting `ScanUploadProgress` so the UI can avoid 0% stalls.
 * - Submits metadata to the HTTPS function, handles cleanup (`deleteScanApi`), and fetches Firestore results.
 */
import { apiFetch, ApiError } from "@/lib/http";
import { resolveFunctionUrl } from "@/lib/api/functionsBase";
import { auth, db, storage } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { ref, uploadBytesResumable, type UploadTaskSnapshot } from "firebase/storage";

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
  status: "pending" | "processing" | "complete" | "completed" | "failed" | "error";
  errorMessage?: string | null;
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

export type ScanError = { code?: string; message: string; debugId?: string; status?: number; reason?: string };

export type ScanApiResult<T> = { ok: true; data: T } | { ok: false; error: ScanError };

function parseTimestamp(value: unknown): Date {
  if (value instanceof Date) return value;
  if (value && typeof (value as { toDate?: () => Date }).toDate === "function") {
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

function toScanDocument(id: string, uid: string, data: FirestoreScan): ScanDocument {
  const fallbackPaths = data.photoPaths as ScanDocument["photoPaths"] | undefined;
  const input = data.input as ScanDocument["input"] | undefined;
  const completedAtRaw = data.completedAt as unknown;
  return {
    id,
    uid,
    createdAt: parseTimestamp(data.createdAt),
    updatedAt: parseTimestamp(data.updatedAt),
    completedAt: completedAtRaw ? parseTimestamp(completedAtRaw) : null,
    status: (data.status as ScanDocument["status"]) ?? "pending",
    errorMessage: typeof data.errorMessage === "string" ? data.errorMessage : null,
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

function buildScanError(err: unknown, fallbackMessage: string, reason?: string): ScanError {
  if (err instanceof ApiError) {
    const data = (err.data ?? {}) as { code?: string; message?: string; debugId?: string; reason?: string };
    const message = typeof data.message === "string" && data.message.length ? data.message : fallbackMessage;
    return { code: err.code ?? data.code, message, debugId: data.debugId, status: err.status, reason: reason ?? data.reason };
  }
  if (err instanceof Error) return { message: err.message, reason };
  return { message: fallbackMessage, reason };
}

export function deserializeScanDocument(id: string, uid: string, data: Record<string, unknown>): ScanDocument {
  return toScanDocument(id, uid, data);
}

export async function startScanSessionClient(params: {
  currentWeightKg: number;
  goalWeightKg: number;
}): Promise<ScanApiResult<StartScanResponse>> {
  const user = auth.currentUser;
  if (!user) return { ok: false, error: { message: "Please sign in before starting a scan." } };
  try {
    const data = await apiFetch<StartScanResponse>(startUrl(), {
      method: "POST",
      body: {
        currentWeightKg: params.currentWeightKg,
        goalWeightKg: params.goalWeightKg,
      },
    });
    if (!data?.scanId) {
      return { ok: false, error: { message: "We couldn't start your scan. Please try again." } };
    }
    return { ok: true, data };
  } catch (err) {
    console.error("scan:start error", err);
    return { ok: false, error: buildScanError(err, "Unable to start your scan right now.") };
  }
}

async function uploadPhoto(
  path: string,
  file: File,
  onProgress?: (snapshot: UploadTaskSnapshot) => void,
): Promise<void> {
  const storageRef = ref(storage, path);
  await new Promise<void>((resolve, reject) => {
    const task = uploadBytesResumable(storageRef, file, { contentType: file.type || "image/jpeg" });
    task.on(
      "state_changed",
      (snapshot) => onProgress?.(snapshot),
      (error) => reject(error),
      () => resolve(),
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
};

const MIN_VISIBLE_PROGRESS = 0.01;

type UploadTarget = {
  pose: keyof StartScanResponse["storagePaths"];
  path: string;
  file: File;
  size: number;
};

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

export async function submitScanClient(
  params: {
    scanId: string;
    storagePaths: { front: string; back: string; left: string; right: string };
    photos: { front: File; back: File; left: File; right: File };
    currentWeightKg: number;
    goalWeightKg: number;
  },
  options?: { onUploadProgress?: (progress: ScanUploadProgress) => void },
): Promise<ScanApiResult<void>> {
  const user = auth.currentUser;
  if (!user) return { ok: false, error: { message: "Please sign in before submitting a scan." } };
  let uploadsCompleted = false;
  try {
    const entries = Object.entries(params.storagePaths) as Array<[keyof typeof params.storagePaths, string]>;
    if (!entries.length) {
      return { ok: false, error: { message: "Missing upload targets for this scan." } };
    }
    const uploadTargets: UploadTarget[] = [];
    for (const [pose, path] of entries) {
      const file = params.photos[pose];
      if (!file) return { ok: false, error: { message: `Missing ${pose} photo.` } };
      const size = Number.isFinite(file.size) ? Number(file.size) : 0;
      uploadTargets.push({ pose, path, file, size });
    }
    if (!uploadTargets.length) {
      return { ok: false, error: { message: "No photos selected for this scan." } };
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

    const fileCount = uploadTargets.length;
    const totalBytes = uploadTargets.reduce((sum, target) => sum + target.size, 0);
    const safeTotalBytes = totalBytes > 0 ? totalBytes : fileCount;
    const fallbackDenominator = fileCount || 1;
    let uploadedBytes = 0;

    for (const [index, target] of uploadTargets.entries()) {
      await uploadPhoto(target.path, target.file, (snapshot) => {
        const snapshotTotal = snapshot.totalBytes || target.size || 1;
        const snapshotBytes = snapshot.bytesTransferred || 0;
        const hasTransferred = snapshotBytes > 0;
        const filePercent = ensureVisibleProgress(
          snapshotTotal > 0 ? snapshotBytes / snapshotTotal : 0,
          hasTransferred,
        );
        const bytesBasis =
          safeTotalBytes > 0 ? (uploadedBytes + snapshotBytes) / safeTotalBytes : (index + filePercent) / fallbackDenominator;
        const overallPercent = ensureVisibleProgress(bytesBasis, hasTransferred);
        options?.onUploadProgress?.({
          pose: target.pose,
          fileIndex: index,
          fileCount,
          bytesTransferred: snapshotBytes,
          totalBytes: snapshotTotal,
          percent: filePercent,
          overallPercent,
        });
      });

      uploadedBytes += target.size;
      const normalizedOverall =
        safeTotalBytes > 0 ? uploadedBytes / safeTotalBytes : (index + 1) / fallbackDenominator;
      options?.onUploadProgress?.({
        pose: target.pose,
        fileIndex: index,
        fileCount,
        bytesTransferred: target.size,
        totalBytes: target.size,
        percent: 1,
        overallPercent: clampProgressFraction(normalizedOverall),
      });
    }

    uploadsCompleted = true;
    await apiFetch(submitUrl(), {
      method: "POST",
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
    return { ok: false, error: buildScanError(err, fallback, reason) };
  }
}

export async function getScan(scanId: string): Promise<ScanApiResult<ScanDocument>> {
  const uid = auth.currentUser?.uid;
  if (!uid) return { ok: false, error: { message: "Please sign in to view this scan." } };
  if (!scanId.trim()) return { ok: false, error: { message: "Missing scan id." } };
  try {
    const ref = doc(db, "users", uid, "scans", scanId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return { ok: false, error: { message: "Scan not found." } };
    const data = snap.data() as Record<string, unknown>;
    return { ok: true, data: toScanDocument(snap.id, uid, data) };
  } catch (err) {
    console.error("scan:get error", err);
    return { ok: false, error: buildScanError(err, "Unable to load this scan right now.") };
  }
}

type DeleteScanResponse =
  | { ok: true; data?: { scanId?: string | null } }
  | { ok: false; error?: { code?: string | null; message?: string | null; debugId?: string | null } };

export async function deleteScanApi(scanId: string): Promise<ScanApiResult<void>> {
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
      return { ok: false, error: { message: "Unable to delete scan. Please try again." } };
    }

    if ("ok" in response && !response.ok) {
      const message =
        response.error?.message && response.error.message !== "Bad Request"
          ? response.error.message
          : "Unable to delete scan. Please try again.";
      return {
        ok: false,
        error: { message, code: response.error?.code ?? undefined, debugId: response.error?.debugId ?? undefined },
      };
    }

    return { ok: true, data: undefined };
  } catch (error) {
    console.error("scan:delete error", error);
    return { ok: false, error: buildScanError(error, "Unable to delete scan. Please try again.") };
  }
}
