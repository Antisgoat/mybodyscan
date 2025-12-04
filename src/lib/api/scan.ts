import { apiFetch } from "@/lib/http";
import { resolveFunctionUrl } from "@/lib/api/functionsBase";
import { auth, db, storage } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { ref, uploadBytes } from "firebase/storage";

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
  status: "pending" | "processing" | "complete" | "error";
  errorMessage?: string;
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

export async function startScanSessionClient(params: {
  currentWeightKg: number;
  goalWeightKg: number;
}): Promise<StartScanResponse> {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in");
  const data = await apiFetch<StartScanResponse>(startUrl(), {
    method: "POST",
    body: {
      currentWeightKg: params.currentWeightKg,
      goalWeightKg: params.goalWeightKg,
    },
  });
  if (!data?.scanId) {
    throw new Error("startScan did not return scanId");
  }
  return data;
}

async function uploadPhoto(path: string, file: File): Promise<void> {
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file, { contentType: file.type || "image/jpeg" });
}

export async function submitScanClient(params: {
  scanId: string;
  storagePaths: { front: string; back: string; left: string; right: string };
  photos: { front: File; back: File; left: File; right: File };
  currentWeightKg: number;
  goalWeightKg: number;
}): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in");
  const entries = Object.entries(params.storagePaths) as Array<[
    keyof typeof params.storagePaths,
    string
  ]>;
  for (const [pose, path] of entries) {
    const file = params.photos[pose as keyof typeof params.photos];
    if (!file) throw new Error(`Missing ${pose} photo`);
    await uploadPhoto(path, file);
  }

  await apiFetch(submitUrl(), {
    method: "POST",
    body: {
      scanId: params.scanId,
      photoPaths: params.storagePaths,
      currentWeightKg: params.currentWeightKg,
      goalWeightKg: params.goalWeightKg,
    },
  });
}

export async function getScan(scanId: string): Promise<ScanDocument> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Not signed in");
  const ref = doc(db, "users", uid, "scans", scanId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Scan not found");
  const data = snap.data() as any;
  return {
    id: snap.id,
    uid,
    createdAt: data.createdAt?.toDate?.() ?? new Date(),
    updatedAt: data.updatedAt?.toDate?.() ?? new Date(),
    status: data.status ?? "pending",
    errorMessage: data.errorMessage,
    photoPaths: data.photoPaths ?? { front: "", back: "", left: "", right: "" },
    input: data.input ?? { currentWeightKg: 0, goalWeightKg: 0 },
    estimate: data.estimate ?? null,
    workoutPlan: data.workoutPlan ?? null,
    nutritionPlan: data.nutritionPlan ?? null,
  };
}

type DeleteScanResponse =
  | { ok: true; data?: { scanId?: string | null } }
  | { ok: false; error?: { code?: string | null; message?: string | null } };

export async function deleteScanApi(scanId: string): Promise<void> {
  const trimmed = scanId.trim();
  if (!trimmed) {
    throw new Error("Missing scan id.");
  }

  try {
    const response = await apiFetch<DeleteScanResponse>(deleteUrl(), {
      method: "POST",
      body: { scanId: trimmed },
    });

    if (!response) {
      throw new Error("Unable to delete scan. Please try again.");
    }

    if ("ok" in response && !response.ok) {
      const message =
        response.error?.message && response.error.message !== "Bad Request"
          ? response.error.message
          : "Unable to delete scan. Please try again.";
      throw new Error(message);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to delete scan. Please try again.";
    throw new Error(message);
  }
}
