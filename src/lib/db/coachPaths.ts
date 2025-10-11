import { collection, doc } from "firebase/firestore";

import { db } from "@/lib/firebase";
import { coachChatCollectionPath, coachPlanDocPath } from "@/lib/paths";

// Single document for coach plan: users/{uid}/coachPlans/current
export const coachPlanDoc = (uid: string) => doc(db, coachPlanDocPath(uid));

export const coachChatCollection = (uid: string) => collection(db, coachChatCollectionPath(uid));

export const workoutLogsCol = (uid: string) => collection(db, "users", uid, "workoutLogs");
