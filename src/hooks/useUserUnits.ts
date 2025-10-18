import { useState, useEffect } from "react";
import { auth, db } from "@app/lib/firebase.ts";
import { setDoc } from "@app/lib/dbWrite.ts";
import { doc, onSnapshot } from "firebase/firestore";

export type UnitSystem = "US" | "metric";

export function useUserUnits() {
  const [units, setUnits] = useState<UnitSystem>("US"); // Default to US units
  const [loading, setLoading] = useState(true);
  const uid = auth.currentUser?.uid;

  useEffect(() => {
    if (!uid) {
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
  }, [uid]);

  const updateUnits = async (newUnits: UnitSystem) => {
    if (!uid) return;
    
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
    updateUnits
  };
}