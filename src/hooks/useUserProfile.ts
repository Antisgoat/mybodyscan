import { useEffect, useState } from "react";
import { auth, db } from "@/lib/firebase";
import { doc, onSnapshot } from "firebase/firestore";
import { coachPlanDoc } from "@/lib/db/coachPaths";

export interface CoachProfile {
  sex?: "male" | "female";
  age?: number;
  dob?: string;
  height_cm?: number;
  weight_kg?: number;
  activity_level?: "sedentary" | "light" | "moderate" | "very" | "extra";
  goal?: "lose_fat" | "gain_muscle" | "improve_heart";
  timeframe_weeks?: number;
  style?: "ease_in" | "all_in";
  medical_flags?: Record<string, boolean>;
  currentProgramId?: string;
  activeProgramId?: string;
  lastCompletedWeekIdx?: number;
  lastCompletedDayIdx?: number;
  currentWeekIdx?: number;
  currentDayIdx?: number;
  startedAt?: string;
}

export interface CoachPlan {
  tdee: number;
  target_kcal: number;
  goal: string;
  style: string;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
  [k: string]: unknown;
}

export function useUserProfile() {
  const [profile, setProfile] = useState<CoachProfile | null>(null);
  const [plan, setPlan] = useState<CoachPlan | null>(null);
  const uid = auth.currentUser?.uid || null;

  useEffect(() => {
    if (!uid) return;
    const profileRef = doc(db, "users", uid, "coach", "profile");
    const unsub1 = onSnapshot(profileRef, (snap) => {
      setProfile((snap.data() as CoachProfile) || null);
    });
    const planRef = coachPlanDoc(uid);
    const unsub2 = onSnapshot(planRef, (snap) => {
      setPlan((snap.data() as CoachPlan) || null);
    });
    return () => {
      unsub1();
      unsub2();
    };
  }, [uid]);

  return { profile, plan };
}

