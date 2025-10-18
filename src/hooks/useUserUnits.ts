import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { setDoc } from "@/lib/dbWrite";
import { doc, onSnapshot } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { getSequencedAuth } from "@/lib/firebase/init";

export type UnitSystem = "US" | "metric";

export function useUserUnits() {
  const [units, setUnits] = useState<UnitSystem>("US"); // Default to US units
  const [loading, setLoading] = useState(true);
  const [uid, setUid] = useState<string | null>(null);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;

    void (async () => {
      const auth = await getSequencedAuth();
      if (cancelled) return;
      setUid(auth.currentUser?.uid ?? null);
      unsubscribe = onAuthStateChanged(auth, (user) => {
        setUid(user?.uid ?? null);
      });
    })();

    return () => {
      cancelled = true;
      if (unsubscribe) unsubscribe();
    };
  }, []);

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