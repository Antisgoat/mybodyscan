import { collection, doc } from "firebase/firestore";

import { db } from "@/lib/firebase";

export const coachPlanDoc = (uid: string) => doc(db, "users", uid, "coach", "plan", "current");

export const workoutLogsCol = (uid: string) => collection(db, "users", uid, "workoutLogs");
