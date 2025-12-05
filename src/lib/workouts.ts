import { auth as firebaseAuth, db } from "./firebase";
import { collection, getDocs } from "firebase/firestore";
import { isDemoActive } from "./demoFlag";
import { track } from "./analytics";
import { DEMO_WORKOUT_PLAN } from "./demoContent";
const FUNCTIONS_URL = import.meta.env.VITE_FUNCTIONS_URL as string;

async function callFn(path: string, body?: any) {
  const user = firebaseAuth?.currentUser;
  if (!user) throw new Error("auth");
  const t = await user.getIdToken();
  const r = await fetch(`${FUNCTIONS_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
    body: JSON.stringify(body || {}),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function generateWorkoutPlan(prefs?: Record<string, any>) {
  if (isDemoActive()) {
    track("demo_block", { action: "workout_generate" });
    throw new Error("demo-blocked");
  }
  return callFn("/generateWorkoutPlan", { prefs });
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
    return null;
  }
}

export async function markExerciseDone(planId: string, dayIndex: number, exerciseId: string, done: boolean) {
  if (isDemoActive()) {
    track("demo_block", { action: "workout_done" });
    throw new Error("demo-blocked");
  }
  return callFn("/markExerciseDone", { planId, dayIndex, exerciseId, done });
}

export async function getWeeklyCompletion(planId: string) {
  if (isDemoActive()) {
    track("demo_block", { action: "workout_weekly" });
    return 0;
  }
  const uid = firebaseAuth?.currentUser?.uid;
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
    const planDay = plan?.days?.find((p: any) => p.day === dayNames[d.getDay()]);
    if (planDay) {
      total += planDay.exercises.length;
      if (docSnap) completed += (docSnap.data()?.completed || []).length;
    }
  }
  return total ? completed / total : 0;
}
