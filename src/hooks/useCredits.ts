import { useCallback, useEffect, useRef, useState } from "react";
import { onIdTokenChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { auth as firebaseAuth, db, functions as firebaseFunctions, getFirebaseConfig } from "@/lib/firebase";

export function useCredits() {
  const [credits, setCredits] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [unlimited, setUnlimited] = useState(false);
  const refreshAttemptRef = useRef<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  let projectId = "";
  try {
    projectId = getFirebaseConfig().projectId;
  } catch {
    projectId = "";
  }

  useEffect(() => {
    const unsubscribe = onIdTokenChanged(
      firebaseAuth,
      async (u) => {
        setUid(u?.uid ?? null);
        if (!u) {
          setCredits(0);
          setUnlimited(false);
          setLoading(false);
          refreshAttemptRef.current = null;
        } else {
          let token = await u.getIdTokenResult();
          if (refreshAttemptRef.current !== u.uid) {
            refreshAttemptRef.current = u.uid;
            try {
              const refresh = httpsCallable(firebaseFunctions, "refreshClaims");
              await refresh();
              token = await u.getIdTokenResult(true);
            } catch (refreshError) {
              if (import.meta.env.DEV) {
                console.warn("[credits] refreshClaims failed", refreshError);
              }
            }
          }
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
  }, [uid, refreshTick]);

  const refresh = useCallback(() => {
    setRefreshTick((prev) => prev + 1);
  }, []);

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
      refresh,
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
    refresh,
  } as const;
}

