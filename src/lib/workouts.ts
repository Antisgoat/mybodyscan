import { db } from "./firebase";
import { getCachedUser } from "@/auth/facade";
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
import { fnJson } from "@/lib/fnCall";
import {
  buildCustomPlanTitleFromPrefs,
  generateCustomPlanDaysFromLibrary,
} from "@/lib/workoutsCustomGenerator";

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

export type CustomPlanGoal = "lose_fat" | "build_muscle" | "recomp" | "performance";
export type CustomPlanExperience = "beginner" | "intermediate" | "advanced";
export type CustomPlanStyle =
  | "strength"
  | "hypertrophy"
  | "athletic"
  | "minimal_equipment"
  | "balanced";
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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableActivationError(error: unknown): boolean {
  const anyErr = error as any;
  const message =
    typeof anyErr?.message === "string" ? (anyErr.message as string) : "";
  const status = typeof anyErr?.status === "number" ? (anyErr.status as number) : 0;
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

async function callFn(path: string, body?: any) {
  return fnJson(path, { method: "POST", body: body || {} });
}

async function fetchPlanFromFirestore() {
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
    return { id: planId, ...data };
  } catch (error) {
    console.warn("workouts.plan_fallback_failed", error);
    return null;
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

export async function generateWorkoutPlan(prefs?: Record<string, any>) {
  if (isDemoActive()) {
    track("demo_block", { action: "workout_generate" });
    throw new Error("demo-blocked");
  }
  try {
    return await callFn("/generateWorkoutPlan", { prefs });
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

export async function getPlan() {
  if (isDemoActive()) {
    track("demo_block", { action: "workout_plan" });
    return DEMO_WORKOUT_PLAN;
  }
  try {
    return await callFn("/getPlan", {});
  } catch (error) {
    console.warn("workouts.getPlan", error);
    if (error instanceof Error && error.message.startsWith("fn_not_found")) {
      const fallback = await fetchPlanFromFirestore();
      if (fallback) return fallback;
      throw new Error("workouts_disabled_missing_fn");
    }
    return null;
  }
}

export async function applyCatalogPlan(plan: CatalogPlanSubmission) {
  if (isDemoActive()) {
    track("demo_block", { action: "workout_apply_plan" });
    throw new Error("demo-blocked");
  }
  return callFn("/applyCatalogPlan", plan);
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
  const res = await callFn("/applyCustomPlan", params);
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
  const res = await callFn("/updateWorkoutPlan", params);
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
  const res = await callFn("/setWorkoutPlanStatus", params);
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
    const res = await callFn("/getWorkouts", {});
    const planId = (res?.planId as string | null | undefined) ?? null;
    const days = Array.isArray(res?.days) ? (res.days as WorkoutDay[]) : [];
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
        days: Array.isArray(fallback.days)
          ? (fallback.days as WorkoutDay[])
          : [],
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
) {
  if (isDemoActive()) {
    track("demo_block", { action: "workout_done" });
    throw new Error("demo-blocked");
  }
  return callFn("/markExerciseDone", { planId, dayIndex, exerciseId, done });
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
  const res = await callFn("/logWorkoutExercise", params);
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
