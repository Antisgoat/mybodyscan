import { useCallback, useEffect, useState } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuthUser } from "@/lib/auth";
import { useDemoMode } from "@/components/DemoModeProvider";

export type DisplayUnits = "us" | "metric";

interface UnitsState {
  units: DisplayUnits;
  loading: boolean;
  saving: boolean;
  error: string | null;
  setUnits: (next: DisplayUnits) => Promise<void>;
}

const DEFAULT_UNITS: DisplayUnits = "us";

export function useUnits(): UnitsState {
  const { user } = useAuthUser();
  const demo = useDemoMode();
  const [units, setUnitsState] = useState<DisplayUnits>(DEFAULT_UNITS);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (demo) {
      setUnitsState(DEFAULT_UNITS);
      setLoading(false);
      return;
    }
    if (!user || !db) {
      setUnitsState(DEFAULT_UNITS);
      setLoading(false);
      return;
    }

    setLoading(true);
    const ref = doc(db, "users", user.uid);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const pref = (snap.data()?.preferences as { units?: DisplayUnits } | undefined)?.units;
        setUnitsState(pref === "metric" ? "metric" : DEFAULT_UNITS);
        setLoading(false);
      },
      (err) => {
        setError(err.message || "Failed to load units");
        setUnitsState(DEFAULT_UNITS);
        setLoading(false);
      },
    );
    return () => unsub();
  }, [user?.uid, demo]);

  const persistUnits = useCallback(
    async (next: DisplayUnits) => {
      setUnitsState(next);
      if (demo || !user || !db) return;
      setSaving(true);
      try {
        await setDoc(doc(db, "users", user.uid), { preferences: { units: next } }, { merge: true });
        setError(null);
      } catch (err: any) {
        setError(err?.message || "Unable to save units");
        setUnitsState((prev) => prev);
        throw err;
      } finally {
        setSaving(false);
      }
    },
    [user, demo],
  );

  return { units, loading, saving, error, setUnits: persistUnits };
}
