import { useState, useEffect } from "react";
import { db, requireAuth } from "@/lib/firebase";
import { setDoc } from "@/lib/dbWrite";
import { doc, onSnapshot } from "firebase/firestore";
import { isNative } from "@/lib/platform";

export type UnitSystem = "US" | "metric";

export function useUserUnits() {
  const [units, setUnits] = useState<UnitSystem>("US"); // Default to US units
  const [loading, setLoading] = useState(true);
  const [uid, setUid] = useState<string | null>(null);

  useEffect(() => {
    if (isNative()) {
      setUid(null);
      setLoading(false);
      return undefined;
    }
    let unsub: (() => void) | null = null;
    let cancelled = false;
    void (async () => {
      const auth = await requireAuth().catch(() => null);
      if (!auth || cancelled) {
        setUid(null);
        setLoading(false);
        return;
      }
      setUid(auth.currentUser?.uid ?? null);
      const { onAuthStateChanged } = await import("firebase/auth");
      unsub = onAuthStateChanged(auth, (user) => {
        setUid(user?.uid ?? null);
      });
    })();

    return () => {
      cancelled = true;
      if (unsub) unsub();
    };
  }, []);

  useEffect(() => {
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
  }, [uid]);

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
