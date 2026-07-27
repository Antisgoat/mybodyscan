import { useCallback, useEffect, useState } from "react";
import { doc, onSnapshot, serverTimestamp } from "firebase/firestore";
import { useAuthUser } from "@/auth/mbs-auth";
import { db } from "@/lib/firebase";
import { setDoc } from "@/lib/dbWrite";
import {
  normalizeAllergens,
  type MajorAllergen,
} from "@/lib/nutrition/allergens";

export type NutritionSafetyPreferences = {
  allergies: MajorAllergen[];
  allergyNotes: string;
};

const EMPTY_PREFERENCES: NutritionSafetyPreferences = {
  allergies: [],
  allergyNotes: "",
};

export function useNutritionSafety() {
  const { user } = useAuthUser();
  const [preferences, setPreferences] =
    useState<NutritionSafetyPreferences>(EMPTY_PREFERENCES);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.uid) {
      setPreferences(EMPTY_PREFERENCES);
      setLoading(false);
      return;
    }
    setLoading(true);
    return onSnapshot(
      doc(db, "users", user.uid),
      (snapshot) => {
        const onboarding = snapshot.data()?.onboarding;
        setPreferences({
          allergies: normalizeAllergens(onboarding?.allergies),
          allergyNotes:
            typeof onboarding?.allergyNotes === "string"
              ? onboarding.allergyNotes.slice(0, 280)
              : "",
        });
        setLoading(false);
      },
      () => {
        setPreferences(EMPTY_PREFERENCES);
        setLoading(false);
      }
    );
  }, [user?.uid]);

  const save = useCallback(
    async (next: NutritionSafetyPreferences) => {
      if (!user?.uid) throw new Error("Sign in to save allergy preferences.");
      await setDoc(
        doc(db, "users", user.uid),
        {
          onboarding: {
            allergies: normalizeAllergens(next.allergies),
            allergyNotes: next.allergyNotes.trim().slice(0, 280),
          },
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    },
    [user?.uid]
  );

  return { preferences, loading, save };
}
