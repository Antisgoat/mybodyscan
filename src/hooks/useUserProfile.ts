import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import { doc, onSnapshot } from "firebase/firestore";
import { coachPlanDoc } from "@/lib/db/coachPaths";
import { useAuthUser } from "@/lib/auth";
import { useDemoMode } from "@/components/DemoModeProvider";
import { DEMO_COACH_PLAN, DEMO_COACH_PROFILE } from "@/lib/demoContent";
import type { ProgramPreferences } from "@/lib/programs/preferences";
import { setDoc } from "@/lib/dbWrite";
import { normalizeWeightFields } from "@/lib/profile/normalizeWeight";
import type { WeightUnit } from "@/lib/units";

export type CoachSex = "male" | "female" | "unspecified" | "other";

export interface CoachProfile {
  sex?: CoachSex;
  age?: number;
  dob?: string;
  height_cm?: number;
  heightCm?: number;
  weight_kg?: number;
  /** Canonical storage (kg). Kept alongside `weight_kg` for backwards compatibility. */
  weightKg?: number;
  /** Preferred display unit for weight. */
  unit?: WeightUnit;
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
  programPreferences?: ProgramPreferences;
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
  const { user, authReady } = useAuthUser();
  const appCheckReady = true;
  const uid = authReady ? (user?.uid ?? null) : null;
  const demo = useDemoMode();
  const normalizedWeightRef = useState(() => new Set<string>())[0];

  useEffect(() => {
    if (demo) {
      setProfile(DEMO_COACH_PROFILE);
      setPlan(DEMO_COACH_PLAN);
      return;
    }
    if (!authReady || !appCheckReady || !uid) {
      setProfile(null);
      setPlan(null);
      return;
    }
    const profileRef = doc(db, "users", uid, "coach", "profile");
    const unsub1 = onSnapshot(
      profileRef,
      (snap) => {
        const raw = (snap.data() as CoachProfile) || null;
        if (!raw) {
          setProfile(null);
          return;
        }
        const height =
          typeof raw.heightCm === "number"
            ? raw.heightCm
            : typeof raw.height_cm === "number"
              ? raw.height_cm
              : undefined;
        const normalized = normalizeWeightFields(raw as any);
        if (!demo && normalized.patch && uid && !normalizedWeightRef.has(uid)) {
          normalizedWeightRef.add(uid);
          // Fire-and-forget: keep UI responsive even if Firestore write fails.
          void setDoc(profileRef, normalized.patch, { merge: true }).catch(() => {
            // Allow future attempts if this one failed (e.g. offline / rules).
            normalizedWeightRef.delete(uid);
          });
        }
        const weightKg =
          normalized.weightKg != null ? normalized.weightKg : (raw.weight_kg ?? undefined);
        setProfile({
          ...raw,
          heightCm: height,
          height_cm: height ?? raw.height_cm,
          weightKg: weightKg,
          weight_kg: weightKg,
          unit: normalized.unit ?? raw.unit,
        });
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
        const data = snap.data() as CoachPlan & {
          updatedAt?: { toDate?: () => Date };
        };
        const updatedAt = data.updatedAt?.toDate?.() ?? data.updatedAt;
        setPlan({
          ...data,
          updatedAt: updatedAt instanceof Date ? updatedAt : undefined,
        });
      },
      () => {
        setPlan(null);
      }
    );
    return () => {
      unsub1();
      unsub2();
    };
  }, [demo, authReady, appCheckReady, uid]);

  return { profile, plan };
}
