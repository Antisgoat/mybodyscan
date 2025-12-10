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
    const fileCount = entries.length;
    const totalBytes = entries.reduce((sum, [pose]) => {
      const size = params.photos[pose]?.size ?? 0;
      return sum + (Number.isFinite(size) ? size : 0);
    }, 0);
    const safeTotalBytes = totalBytes > 0 ? totalBytes : fileCount;
    let uploadedBytes = 0;
    let completedFiles = 0;
    for (const [index, [pose, path]] of entries.entries()) {
      const file = params.photos[pose];
      if (!file) return { ok: false, error: { message: `Missing ${pose} photo` } };
      await uploadPhoto(path, file, (snapshot) => {
        const percent = snapshot.totalBytes ? snapshot.bytesTransferred / snapshot.totalBytes : 0;
        const currentBytes = snapshot.bytesTransferred || 0;
        const overallBytes = uploadedBytes + currentBytes;
        const overallPercent = Math.min(1, Math.max(0, overallBytes / safeTotalBytes));
        options?.onUploadProgress?.({
          pose,
          fileIndex: index,
          fileCount,
          bytesTransferred: snapshot.bytesTransferred,
          totalBytes: snapshot.totalBytes,
          percent,
          overallPercent,
        });
      });
      completedFiles += 1;
      uploadedBytes += file.size || 0;
      const normalizedOverall = Math.min(1, Math.max(0, uploadedBytes / safeTotalBytes));
      options?.onUploadProgress?.({
        pose,
        fileIndex: index,
        fileCount,
        bytesTransferred: file.size,
        totalBytes: file.size,
        percent: 1,
        overallPercent: normalizedOverall || completedFiles / fileCount,
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
