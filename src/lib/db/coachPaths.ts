import { collection, doc } from "firebase/firestore";

import { db } from "@app/lib/firebase.ts";
import { coachPlanDocPath } from "@app/lib/paths.ts";

// Single document for coach plan: users/{uid}/coachPlans/current
export const coachPlanDoc = (uid: string) => doc(db, coachPlanDocPath(uid));

export const coachChatCollection = (uid: string) => collection(doc(db, "users", uid, "coach", "chatMeta"), "chat");

export const workoutLogsCol = (uid: string) => collection(db, "users", uid, "workoutLogs");
