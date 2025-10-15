import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { isDemo as isDemoAuth } from "@/lib/auth";

export function useCredits() {
  const [credits, setCredits] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [unlimited, setUnlimited] = useState(false);
  const [tester, setTester] = useState(false);
  const [demo, setDemo] = useState(false);
  const projectId =
    import.meta.env.VITE_FIREBASE_PROJECT_ID || "mybodyscan-f3daf";

  useEffect(() => {
    const unsub = onAuthStateChanged(
      auth,
      async (u) => {
        setUid(u?.uid ?? null);
        setDemo(Boolean(u?.isAnonymous && isDemoAuth()));
        if (!u) {
          setCredits(0);
          setUnlimited(false);
          setTester(false);
          setLoading(false);
        } else {
          const token = await u.getIdTokenResult();
          const hasTester = token.claims.tester === true;
          const hasUnlimited = hasTester || token.claims.unlimitedCredits === true;
          setTester(hasTester);
          setUnlimited(hasUnlimited);
          if (hasUnlimited) {
            setLoading(false);
          } else {
            setLoading(true);
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

  const readOnlyNotice = demo ? "Demo browse only" : null;

  if (unlimited) {
    return {
      credits: Infinity,
      loading,
      error,
      uid,
      projectId,
      unlimited: true,
      tester,
      demo,
      notice: readOnlyNotice,
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
    tester,
    demo,
    notice: readOnlyNotice,
    remaining: credits,
    used: 0,
  } as const;
}

