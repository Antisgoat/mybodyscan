import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db, firebaseConfig } from "@/lib/firebase";

export function useCredits() {
  const [credits, setCredits] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const projectId = firebaseConfig.projectId;

  useEffect(() => {
    const unsub = onAuthStateChanged(
      auth,
      (u) => {
        setUid(u?.uid ?? null);
        if (!u) {
          setCredits(0);
          setLoading(false);
        }
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!uid) return;

    setLoading(true);
    const ref = doc(db, "users", uid);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        interface UserDoc { credits?: number | { wallet?: number } }
        const data = snap.data() as UserDoc | undefined;
        const value = data?.credits;
        const amount = typeof value === "number" ? value : value?.wallet ?? 0;
        setCredits(amount ?? 0);
        setLoading(false);
      },
      (err) => {
        console.error("Error fetching credits:", err);
        setError(err.message);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [uid]);

  return { credits, loading, error, uid, projectId };
}

