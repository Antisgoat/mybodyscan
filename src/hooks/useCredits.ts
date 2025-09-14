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
    const ref = doc(db, "users", uid, "private", "credits");
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const data = snap.data() as { total?: number } | undefined;
        const amount = Number(data?.total ?? 0);
        setCredits(amount);
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

