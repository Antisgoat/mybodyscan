import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth as firebaseAuth, db, firebaseConfig } from "@/lib/firebase";

export function useCredits() {
  const [credits, setCredits] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [unlimited, setUnlimited] = useState(false);
  const projectId = firebaseConfig.projectId;

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      firebaseAuth,
      async (u) => {
        setUid(u?.uid ?? null);
        if (!u) {
          setCredits(0);
          setUnlimited(false);
          setLoading(false);
        } else {
          const token = await u.getIdTokenResult();
          const hasUnlimited = token.claims.unlimitedCredits === true;
          setUnlimited(hasUnlimited);
        }
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      }
    );

    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!uid) return;

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
  }, [uid]);

  if (unlimited) {
    return {
      credits: Infinity,
      loading,
      error,
      uid,
      projectId,
      unlimited: true,
      remaining: Infinity,
      used: 0,
    } as const;
  }

  return {
    credits,
    loading,
    error,
    uid,
    projectId,
    unlimited: false,
    remaining: credits,
    used: 0,
  } as const;
}

