import { db } from "./firebase";
import { getCachedUser } from "@/auth/mbs-auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
} from "firebase/firestore";
import { isDemoActive } from "./demoFlag";
import { track } from "./analytics";
import { DEMO_WORKOUT_PLAN } from "./demoContent";
import { callRequestFunction } from "@/lib/backend/callBackend";
import {
  buildCustomPlanTitleFromPrefs,
  generateCustomPlanDaysFromLibrary,
} from "@/lib/workoutsCustomGenerator";
import {
  CORE_WORKOUT_FALLBACK,
  toWorkoutSummaryFallback,
} from "@/lib/workoutsFallback";

export interface WorkoutExercise {
  id: string;
  name: string;
  sets?: number;
  reps?: number | string;
}

export interface WorkoutDay {
  day: string;
  exercises: WorkoutExercise[];
}

export interface WorkoutSummary {
  planId: string | null;
  days: WorkoutDay[];
  progress: Record<string, string[]>;
}

export interface ActiveWorkoutPlan {
  id: string;
  title?: string;
  days: WorkoutDay[];
}

export interface CatalogPlanExercise {
  name: string;
  sets: number;
  reps: number | string;
}

export interface CatalogPlanDay {
  day: string;
  exercises: CatalogPlanExercise[];
}

export interface CatalogPlanSubmission {
  programId: string;
  title?: string;
  goal?: string;
  level?: string;
  days: CatalogPlanDay[];
}

export type CustomPlanGoal =
  "lose_fat" | "build_muscle" | "recomp" | "performance";
export type CustomPlanExperience = "beginner" | "intermediate" | "advanced";
export type CustomPlanStyle =
  "strength" | "hypertrophy" | "athletic" | "minimal_equipment" | "balanced";
export type CustomPlanFocus =
  | "full_body"
  | "upper_lower"
  | "push_pull_legs"
  | "bro_split"
  | "custom_emphasis";

export interface CustomPlanPrefs {
  goal?: CustomPlanGoal;
  daysPerWeek?: number;
  preferredDays?: Array<"Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun">;
  timePerWorkout?: "30" | "45" | "60" | "75+";
  equipment?: string[];
  equipmentInventory?: string[];
  trainingStyle?: CustomPlanStyle;
  experience?: CustomPlanExperience;
  focus?: CustomPlanFocus;
  emphasis?: string[];
  injuries?: string | null;
  avoidExercises?: string | null;
  cardioPreference?: string | null;
}

export type UpdateWorkoutPlanOp =
  | {
      type: "update_exercise";
      dayIndex: number;
      exerciseIndex: number;
      name?: string;
      sets?: number;
      reps?: number | string;
    }
  | {
      type: "reorder_exercise";
      dayIndex: number;
      fromIndex: number;
      toIndex: number;
    }
  | {
      type: "move_exercise";
      fromDayIndex: number;
      fromIndex: number;
      toDayIndex: number;
      toIndex: number;
    }
  | {
      type: "set_day_name";
      dayIndex: number;
      day: "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";
    };

function normalizeWorkoutExercise(value: unknown): WorkoutExercise | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!id || !name) return null;

  const sets =
    raw.sets == null
      ? undefined
      : typeof raw.sets === "number" &&
          Number.isFinite(raw.sets) &&
          raw.sets > 0
        ? raw.sets
        : null;
  if (sets === null) return null;

  const reps =
    raw.reps == null
      ? undefined
      : typeof raw.reps === "number" &&
          Number.isFinite(raw.reps) &&
          raw.reps > 0
        ? raw.reps
        : typeof raw.reps === "string" && raw.reps.trim()
          ? raw.reps.trim()
          : null;
  if (reps === null) return null;

  return {
    id,
    name,
    ...(sets === undefined ? {} : { sets }),
    ...(reps === undefined ? {} : { reps }),
  };
}

function normalizeWorkoutDays(value: unknown): WorkoutDay[] | null {
  if (!Array.isArray(value)) return null;
  const days: WorkoutDay[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry))
      return null;
    const raw = entry as Record<string, unknown>;
    const day = typeof raw.day === "string" ? raw.day.trim() : "";
    if (!day || !Array.isArray(raw.exercises)) return null;
    const exercises = raw.exercises.map(normalizeWorkoutExercise);
    if (exercises.some((exercise) => exercise === null)) return null;
    days.push({ day, exercises: exercises as WorkoutExercise[] });
  }
  return days;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function localDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isRetryableActivationError(error: unknown): boolean {
  const anyErr = error as any;
  const message =
    typeof anyErr?.message === "string" ? (anyErr.message as string) : "";
  const status =
    typeof anyErr?.status === "number" ? (anyErr.status as number) : 0;
  // Common transient cases:
  // - Safari/Network: "Load failed", "Failed to fetch"
  // - Functions transient: 429/502/503/504
  if (
    message.includes("Load failed") ||
    message.includes("Failed to fetch") ||
    message.includes("NetworkError") ||
    message.includes("ECONN") ||
    message.includes("timeout")
  ) {
    return true;
  }
  if ([429, 502, 503, 504].includes(status)) return true;
  if (message.startsWith("fn_error_")) {
    const maybe = Number(message.replace("fn_error_", ""));
    if ([429, 502, 503, 504].includes(maybe)) return true;
  }
  return false;
}

async function callFn<T extends Record<string, any> = Record<string, any>>(
  path: string,
  body?: any
): Promise<T> {
  const name = path.replace(/^\/+/, "");
  return callRequestFunction<T>(name, body || {}, { method: "POST" });
}

async function fetchPlanFromFirestore(): Promise<ActiveWorkoutPlan | null> {
  const uid = getCachedUser()?.uid;
  if (!uid) throw new Error("auth");
  try {
    const metaSnap = await getDoc(
      doc(db, "users", uid, "workoutPlans_meta", "current")
    );
    const planId = metaSnap.exists()
      ? (metaSnap.data()?.activePlanId as string | undefined)
      : undefined;
    if (!planId) return null;
    const planSnap = await getDoc(
      doc(db, `users/${uid}/workoutPlans/${planId}`)
    );
    if (!planSnap.exists()) return null;
    const data = planSnap.data() as Record<string, any>;
    const days = normalizeWorkoutDays(data.days);
    if (!days) {
      throw new Error("workouts_firestore_invalid_days");
    }
    return {
      ...data,
      id: planId,
      title: typeof data.title === "string" ? data.title : undefined,
      days,
    };
  } catch (error) {
    console.warn("workouts.plan_fallback_failed", error);
    return CORE_WORKOUT_FALLBACK;
  }
}

async function fetchProgressFromFirestore(planId: string) {
  const uid = getCachedUser()?.uid;
  if (!uid) throw new Error("auth");
  try {
    const progressRef = collection(
      db,
      `users/${uid}/workoutPlans/${planId}/progress`
    );
    const q = query(progressRef, orderBy("updatedAt", "desc"), limit(14));
    const snaps = await getDocs(q);
    const progress: Record<string, string[]> = {};
    snaps.docs.forEach((docSnap) => {
      const data = docSnap.data() as { completed?: string[] };
      progress[docSnap.id] = Array.isArray(data?.completed)
        ? data.completed
        : [];
    });
    return progress;
  } catch (error) {
    console.warn("workouts.progress_fallback_failed", error);
    return {};
  }
}

export async function generateWorkoutPlan(
  prefs?: Record<string, any>
): Promise<{ planId: string; days: WorkoutDay[] }> {
  if (isDemoActive()) {
    track("demo_block", { action: "workout_generate" });
    throw new Error("demo-blocked");
  }
  try {
    const response = await callFn<{ planId?: string; days?: WorkoutDay[] }>(
      "/generateWorkoutPlan",
      { prefs }
    );
    const planId = typeof response.planId === "string" ? response.planId : "";
    const days = normalizeWorkoutDays(response.days);
    if (!planId || !days?.length) {
      throw new Error("workouts_generate_invalid_response");
    }
    return { planId, days };
  } catch (error: any) {
    if (
      typeof error?.message === "string" &&
      error.message.startsWith("fn_not_found")
    ) {
      throw new Error("workouts_disabled_missing_fn");
    }
    throw error;
  }
}

export async function getPlan(): Promise<ActiveWorkoutPlan> {
  if (isDemoActive()) {
    track("demo_block", { action: "workout_plan" });
    return {
      id: DEMO_WORKOUT_PLAN.id,
      title: "Demo workout plan",
      days: DEMO_WORKOUT_PLAN.days,
    };
  }
  try {
    const response = await callFn<{
      id?: string;
      planId?: string;
      title?: string;
      days?: WorkoutDay[];
    }>("/getPlan", { localDate: localDateKey() });
    const id =
      typeof response.id === "string"
        ? response.id
        : typeof response.planId === "string"
          ? response.planId
          : "";
    const days = normalizeWorkoutDays(response.days);
    if (!id || !days?.length) {
      throw new Error("workouts_plan_invalid_response");
    }
    return {
      id,
      title: typeof response.title === "string" ? response.title : undefined,
      days,
    };
  } catch (error) {
    console.warn("workouts.getPlan", error);
    if (error instanceof Error && error.message.startsWith("fn_not_found")) {
      const fallback = await fetchPlanFromFirestore();
      if (fallback) return fallback;
      throw new Error("workouts_disabled_missing_fn");
    }
    const fallback = toWorkoutSummaryFallback();
    return {
      id: fallback.planId ?? CORE_WORKOUT_FALLBACK.id,
      title: CORE_WORKOUT_FALLBACK.title,
      days: fallback.days,
    };
  }
}

export async function applyCatalogPlan(
  plan: CatalogPlanSubmission
): Promise<{ planId?: string }> {
  if (isDemoActive()) {
    track("demo_block", { action: "workout_apply_plan" });
    throw new Error("demo-blocked");
  }
  return callFn<{ planId?: string }>("/applyCatalogPlan", plan);
}

export async function previewCustomPlan(params: {
  prefs: CustomPlanPrefs;
  title?: string;
  /**
   * Optional deterministic variant seed.
   * Allows "Generate again" to produce a different plan without randomness.
   */
  variant?: number;
}): Promise<{ title: string; prefs: CustomPlanPrefs; days: CatalogPlanDay[] }> {
  if (isDemoActive()) {
    track("demo_block", { action: "workout_preview_custom_plan" });
    throw new Error("demo-blocked");
  }
  // Local, deterministic generator (web + Capacitor-friendly).
  // Keeping this client-side avoids network flakiness and makes Swap quality consistent.
  const title =
    typeof params.title === "string" && params.title.trim().length
      ? params.title.trim()
      : buildCustomPlanTitleFromPrefs(params.prefs);
  const days = generateCustomPlanDaysFromLibrary(params.prefs, {
    variant: typeof params.variant === "number" ? params.variant : undefined,
  });
  return {
    title,
    prefs: params.prefs,
    days,
  };
}

export async function activateCustomPlan(params: {
  prefs: CustomPlanPrefs;
  title?: string;
  goal?: string;
  level?: string;
  days: CatalogPlanDay[];
}): Promise<{ planId: string }> {
  if (isDemoActive()) {
    track("demo_block", { action: "workout_activate_custom_plan" });
    throw new Error("demo-blocked");
  }
  const res = await callFn<{ planId?: string }>("/applyCustomPlan", params);
  const planId = typeof res?.planId === "string" ? res.planId : "";
  if (!planId) throw new Error("workouts_apply_invalid_response");
  return { planId };
}

export async function updateWorkoutPlanRemote(params: {
  planId: string;
  op: UpdateWorkoutPlanOp;
}): Promise<{ ok: true }> {
  if (isDemoActive()) {
    track("demo_block", { action: "workout_update_plan" });
    throw new Error("demo-blocked");
  }
  const res = await callFn<{ ok?: boolean }>("/updateWorkoutPlan", params);
  return { ok: Boolean(res?.ok) as true };
}

export async function setWorkoutPlanStatusRemote(params: {
  planId: string;
  status: "paused" | "ended";
}): Promise<{ ok: true }> {
  if (isDemoActive()) {
    track("demo_block", { action: "workout_plan_status" });
    throw new Error("demo-blocked");
  }
  const res = await callFn<{ ok?: boolean }>("/setWorkoutPlanStatus", params);
  return { ok: Boolean(res?.ok) as true };
}

export async function activateCatalogPlan(
  plan: CatalogPlanSubmission,
  options?: {
    /** Total attempts to call the function (includes first attempt). */
    attempts?: number;
    /** Polls to confirm activation has propagated to Firestore. */
    confirmPolls?: number;
    /** Base backoff used between attempts/polls. */
    backoffMs?: number;
  }
): Promise<{ planId: string }> {
  const attempts = Math.max(1, Math.min(5, options?.attempts ?? 4));
  const confirmPolls = Math.max(1, Math.min(8, options?.confirmPolls ?? 5));
  const backoffMs = Math.max(150, Math.min(3000, options?.backoffMs ?? 500));

  const uid = getCachedUser()?.uid;
  if (!uid) throw new Error("auth");

  let lastErr: unknown = null;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const res = await applyCatalogPlan(plan);
      const planId = typeof res?.planId === "string" ? res.planId : "";
      if (!planId) {
        throw new Error("workouts_apply_invalid_response");
      }

      // Confirm the meta/doc have landed so Workouts can deterministically load.
      for (let poll = 0; poll < confirmPolls; poll++) {
        const [metaSnap, planSnap] = await Promise.all([
          getDoc(doc(db, "users", uid, "workoutPlans_meta", "current")),
          getDoc(doc(db, `users/${uid}/workoutPlans/${planId}`)),
        ]);
        const activePlanId = metaSnap.exists()
          ? (metaSnap.data()?.activePlanId as string | undefined)
          : undefined;
        if (planSnap.exists() && activePlanId === planId) {
          return { planId };
        }
        // Exponential-ish backoff (fast first, then slower).
        await sleep(backoffMs * (poll + 1));
      }

      // Fallback: if the plan doc exists but meta hasn't caught up, still proceed.
      // Workouts page already has a short activation retry loop on `?plan=...`.
      const fallbackPlanSnap = await getDoc(
        doc(db, `users/${uid}/workoutPlans/${planId}`)
      );
      if (fallbackPlanSnap.exists()) {
        return { planId };
      }
      throw new Error("workouts_apply_pending");
    } catch (err) {
      lastErr = err;
      if (attempt < attempts - 1 && isRetryableActivationError(err)) {
        await sleep(backoffMs * Math.pow(2, attempt));
        continue;
      }
      throw err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("workouts_apply_failed");
}

export async function getWorkouts(): Promise<WorkoutSummary | null> {
  if (isDemoActive()) {
    return {
      planId: DEMO_WORKOUT_PLAN.id ?? "demo-plan",
      days: DEMO_WORKOUT_PLAN.days,
      progress: {},
    };
  }
  try {
    const res = await callFn<{
      planId?: string | null;
      days?: WorkoutDay[];
      progress?: Record<string, string[]>;
    }>("/getWorkouts", { localDate: localDateKey() });
    const planId = (res?.planId as string | null | undefined) ?? null;
    const days = normalizeWorkoutDays(res?.days);
    if (!days) {
      throw new Error("workouts_summary_invalid_response");
    }
    const progress = (res?.progress as Record<string, string[]>) ?? {};
    return { planId, days, progress };
  } catch (error: any) {
    console.warn("workouts.getWorkouts", error);
    if (error instanceof Error && error.message.startsWith("fn_not_found")) {
      const fallback = await fetchPlanFromFirestore();
      if (!fallback) throw new Error("workouts_disabled_missing_fn");
      const progress = await fetchProgressFromFirestore(fallback.id as string);
      return {
        planId: fallback.id ?? null,
        days: fallback.days,
        progress,
      };
    }
    return null;
  }
}

export async function markExerciseDone(
  planId: string,
  dayIndex: number,
  exerciseId: string,
  done: boolean
): Promise<{ ratio: number }> {
  if (isDemoActive()) {
    track("demo_block", { action: "workout_done" });
    throw new Error("demo-blocked");
  }
  const response = await callFn<{ ratio?: number }>("/markExerciseDone", {
    planId,
    dayIndex,
    exerciseId,
    done,
  });
  return {
    ratio: Number.isFinite(response.ratio) ? Number(response.ratio) : 0,
  };
}

export async function logWorkoutExercise(params: {
  planId: string;
  exerciseId: string;
  load?: string | null;
  repsDone?: string | null;
  rpe?: number | null;
}): Promise<{ ok: true }> {
  if (isDemoActive()) {
    track("demo_block", { action: "workout_log_exercise" });
    throw new Error("demo-blocked");
  }
  const res = await callFn<{ ok?: boolean }>("/logWorkoutExercise", params);
  return { ok: Boolean(res?.ok) as true };
}

export async function getWeeklyCompletion(planId: string) {
  if (isDemoActive()) {
    track("demo_block", { action: "workout_weekly" });
    return 0;
  }
  const uid = getCachedUser()?.uid;
  if (!uid) throw new Error("auth");
  const col = collection(db, `users/${uid}/workoutPlans/${planId}/progress`);
  const snaps = await getDocs(col);
  let total = 0,
    completed = 0;
  const today = new Date();
  const day = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((day + 6) % 7));
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const plan = await getPlan();
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const iso = d.toISOString().slice(0, 10);
    const docSnap = snaps.docs.find((s) => s.id === iso);
    const planDay = plan?.days?.find(
      (p: any) => p.day === dayNames[d.getDay()]
    );
    const exercises = Array.isArray((planDay as any)?.exercises)
      ? ((planDay as any).exercises as any[])
      : [];
    if (exercises.length) {
      total += exercises.length;
      if (docSnap) completed += (docSnap.data()?.completed || []).length;
    }
  }
  return total ? completed / total : 0;
}
