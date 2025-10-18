import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { isDemo as isDemoAuth } from "@/lib/auth";
import { useOfflineDemo } from "@/components/DemoModeProvider";
import { OFFLINE_DEMO_CREDITS, OFFLINE_DEMO_UID } from "@/lib/demoOffline";
import { isWhitelistedEmail } from "@/lib/whitelist";

export function useCredits() {
  const [credits, setCredits] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [unlimited, setUnlimited] = useState(false);
  const [tester, setTester] = useState(false);
  const [demo, setDemo] = useState(false);
  const [role, setRole] = useState<string | null>(null);
  const offlineDemo = useOfflineDemo();
  const projectId =
    import.meta.env.VITE_FIREBASE_PROJECT_ID || "mybodyscan-f3daf";

  useEffect(() => {
    if (offlineDemo) {
      setUid(OFFLINE_DEMO_UID);
      setDemo(true);
      setCredits(OFFLINE_DEMO_CREDITS.credits);
      setUnlimited(OFFLINE_DEMO_CREDITS.unlimited);
      setTester(OFFLINE_DEMO_CREDITS.tester);
      setLoading(false);
      setError(null);
      return () => {};
    }

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
          setRole(null);
        } else {
          const token = await u.getIdTokenResult();
          const whitelisted = isWhitelistedEmail(u.email ?? undefined);
          const hasTester = whitelisted || token.claims.tester === true;
          const hasUnlimited =
            whitelisted || hasTester || token.claims.unlimitedCredits === true;
          setTester(hasTester);
          setUnlimited(hasUnlimited);
          const roleClaim = typeof token.claims.role === "string" ? token.claims.role : null;
          setRole(roleClaim);
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
  }, [offlineDemo]);

  useEffect(() => {
    if (offlineDemo || !uid || unlimited) return;

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
        setError(err.message);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [offlineDemo, uid, unlimited]);

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
      role,
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
    role,
    notice: readOnlyNotice,
    remaining: credits,
    used: 0,
  } as const;
}

