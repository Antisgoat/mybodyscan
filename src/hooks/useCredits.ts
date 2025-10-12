import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db, firebaseConfig } from "@/lib/firebase";

export function useCredits() {
  const [credits, setCredits] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [unlimited, setUnlimited] = useState(false);
  const projectId = firebaseConfig.projectId;

  useEffect(() => {
    const unsub = onAuthStateChanged(
      auth,
      async (u) => {
        setUid(u?.uid ?? null);
        if (!u) {
          setCredits(0);
          setUnlimited(false);
          setLoading(false);
        } else {
          // Check for unlimitedCredits claim
          const idTokenResult = await u.getIdTokenResult();
          const hasUnlimitedCredits = idTokenResult.claims.unlimitedCredits === true;
          setUnlimited(hasUnlimitedCredits);
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

    // If user has unlimited credits, don't listen to firestore
    if (unlimited) {
      setCredits(Infinity);
      setLoading(false);
      return;
    }

    setLoading(true);
    const ref = doc(db, `users/${uid}/private/credits`);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const amt = snap.data()?.creditsSummary?.totalAvailable as
          | number
          | undefined;
        setCredits(amt ?? 0);
        setLoading(false);
      },
      (err) => {
        console.error("Error fetching credits:", err);
        setError(err.message);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [uid, unlimited]);

  return { credits, loading, error, uid, projectId, unlimited };
}

