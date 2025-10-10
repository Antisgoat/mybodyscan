import { collection, doc } from "firebase/firestore";

import { db } from "@/lib/firebase";

// Single document for coach plan: users/{uid}/coachPlans/current
export const coachPlanDoc = (uid: string) => doc(db, "users", uid, "coachPlans", "current");

export const workoutLogsCol = (uid: string) => collection(db, "users", uid, "workoutLogs");
