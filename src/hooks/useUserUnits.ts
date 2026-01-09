import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { setDoc } from "@/lib/dbWrite";
import { doc, onSnapshot } from "firebase/firestore";
import { useAuthUser } from "@/auth/facade";

export type UnitSystem = "US" | "metric";

export function useUserUnits() {
  const [units, setUnits] = useState<UnitSystem>("US"); // Default to US units
  const [loading, setLoading] = useState(true);
  const { user, authReady } = useAuthUser();
  const uid = user?.uid ?? null;

  useEffect(() => {
    if (!authReady) {
      setLoading(true);
      return;
    }
    if (!uid) {
      setLoading(false);
      return;
    }

    if (!db) {
      setLoading(false);
      return;
    }

    const unitsRef = doc(db, "users", uid, "settings", "units");
    const unsubscribe = onSnapshot(
      unitsRef,
      (snapshot) => {
        if (snapshot.exists()) {
          setUnits(snapshot.data()?.system || "US");
        } else {
          setUnits("US");
        }
        setLoading(false);
      },
      (error) => {
        console.error("Error fetching units:", error);
        setUnits("US");
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [authReady, uid]);

  const updateUnits = async (newUnits: UnitSystem) => {
    if (!uid || !db) return;

    try {
      const unitsRef = doc(db, "users", uid, "settings", "units");
      await setDoc(unitsRef, { system: newUnits }, { merge: true });
      setUnits(newUnits);
    } catch (error) {
      console.error("Error updating units:", error);
    }
  };

  return {
    units,
    useMetric: units === "metric",
    loading,
    updateUnits,
  };
}
