import { auth, db } from "./firebase";
import { collection, getDocs } from "firebase/firestore";
import { isDemoGuest } from "./demoFlag";
import { track } from "./analytics";

const FUNCTIONS_URL = import.meta.env.VITE_FUNCTIONS_URL as string;

async function callFn(path: string, body?: any) {
  const t = await auth.currentUser?.getIdToken();
  if (!t) throw new Error("auth");
  const r = await fetch(`${FUNCTIONS_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
    body: JSON.stringify(body || {}),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function generateWorkoutPlan(prefs?: Record<string, any>) {
    if (isDemoGuest()) {
      track("demo_block", { action: "workout_generate" });
      return demoPlan;
    }
    return callFn("/generateWorkoutPlan", { prefs });
}

export async function getPlan() {
    if (isDemoGuest()) {
      return demoPlan;
    }
    return callFn("/getPlan", {});
}

export async function markExerciseDone(planId: string, dayIndex: number, exerciseId: string, done: boolean) {
    if (isDemoGuest()) {
      track("demo_block", { action: "workout_done" });
      const day = demoPlan.days[dayIndex];
      const ex = day.exercises.find((e: any) => e.id === exerciseId);
      if (ex) ex.done = done;
      const completed = day.exercises.filter((e: any) => e.done).length;
      const ratio = day.exercises.length ? completed / day.exercises.length : 0;
      return { ratio } as any;
    }
    return callFn("/markExerciseDone", { planId, dayIndex, exerciseId, done });
}

export async function getWeeklyCompletion(planId: string) {
    if (isDemoGuest()) {
      const mon = demoPlan.days[0];
      const completed = mon.exercises.filter((e: any) => e.done).length;
      return mon.exercises.length ? completed / mon.exercises.length : 0;
    }
    const uid = auth.currentUser?.uid;
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

const demoPlan = {
  id: "demo",
  days: [
    {
      day: "Mon",
      exercises: [
        { id: "e1", name: "Push Ups", sets: 3, reps: 10, done: true },
        { id: "e2", name: "Squats", sets: 3, reps: 12, done: false },
        { id: "e3", name: "Lunges", sets: 3, reps: 12, done: false },
        { id: "e4", name: "Plank", sets: 3, reps: 60, done: false },
        { id: "e5", name: "Burpees", sets: 3, reps: 10, done: false },
      ],
    },
    { day: "Tue", exercises: [] },
    { day: "Wed", exercises: [] },
    { day: "Thu", exercises: [] },
    { day: "Fri", exercises: [] },
    { day: "Sat", exercises: [] },
    { day: "Sun", exercises: [] },
  ],
};
