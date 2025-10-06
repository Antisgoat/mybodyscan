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

export interface CoachPlanBlock {
  title: string;
  focus: string;
  work: string[];
}

export interface CoachPlanSession {
  day: string;
  blocks: CoachPlanBlock[];
}

export interface CoachPlan {
  days: number;
  split: string;
  sessions: CoachPlanSession[];
  progression: { deloadEvery: number };
  calorieTarget: number;
  proteinFloor: number;
  disclaimer?: string;
  updatedAt?: Date;
}

export function useUserProfile() {
  const [profile, setProfile] = useState<CoachProfile | null>(null);
  const [plan, setPlan] = useState<CoachPlan | null>(null);
  const uid = auth.currentUser?.uid || null;

  useEffect(() => {
    if (!uid) return;
    const profileRef = doc(db, "users", uid, "coach", "profile");
    const unsub1 = onSnapshot(
      profileRef,
      (snap) => {
        setProfile((snap.data() as CoachProfile) || null);
      },
      () => {
        // Swallow profile read errors to avoid crashing UI
        setProfile(null);
      }
    );
    const planRef = coachPlanDoc(uid);
    const unsub2 = onSnapshot(
      planRef,
      (snap) => {
        if (!snap.exists) {
          setPlan(null);
          return;
        }
        const data = snap.data() as CoachPlan & { updatedAt?: { toDate?: () => Date } };
        const updatedAt = data.updatedAt?.toDate?.() ?? data.updatedAt;
        setPlan({ ...data, updatedAt: updatedAt instanceof Date ? updatedAt : undefined });
      },
      () => {
        setPlan(null);
      }
    );
    return () => {
      unsub1();
      unsub2();
    };
  }, [uid]);

  return { profile, plan };
}

