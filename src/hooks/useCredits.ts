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
          // Check for unlimited credits claim
          // This enables whitelisted test accounts to bypass credit consumption
          // while maintaining normal credit tracking for regular users
          const token = await u.getIdTokenResult();
          const hasUnlimitedCredits = token.claims.unlimitedCredits === true;
          setUnlimited(hasUnlimitedCredits);
          
          if (hasUnlimitedCredits) {
            setCredits(Infinity);
            setLoading(false);
          }
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
    if (!uid || unlimited) return;

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

  return { 
    credits: unlimited ? Infinity : credits, 
    loading, 
    error, 
    uid, 
    projectId,
    unlimited,
    remaining: unlimited ? Infinity : credits
  };
}

