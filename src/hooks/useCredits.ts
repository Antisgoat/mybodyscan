import { useCallback, useEffect, useRef, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db, getFirebaseConfig } from "@/lib/firebase";
import { call } from "@/lib/callable";
import { useAuthUser } from "@/lib/auth";

export function useCredits() {
  const [credits, setCredits] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [unlimitedFromToken, setUnlimitedFromToken] = useState(false);
  const [unlimitedFromMirror, setUnlimitedFromMirror] = useState(false);
  const refreshAttemptRef = useRef<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const { user, authReady } = useAuthUser();
  let projectId = "";
  try {
    projectId = getFirebaseConfig().projectId;
  } catch {
    projectId = "";
  }

  useEffect(() => {
    let alive = true;
    void (async () => {
      if (!authReady) {
        if (alive) setLoading(true);
        return;
      }

      setUid(user?.uid ?? null);
      if (!user) {
        setCredits(0);
        setUnlimitedFromToken(false);
        setUnlimitedFromMirror(false);
        setLoading(false);
        setError(null);
        refreshAttemptRef.current = null;
        return;
      }

      setLoading(true);
      setError(null);
      try {
        let token = await user.getIdTokenResult();
        if (refreshAttemptRef.current !== user.uid) {
          refreshAttemptRef.current = user.uid;
          try {
            await call("refreshClaims");
            token = await user.getIdTokenResult(true);
            setRefreshTick((prev) => prev + 1);
          } catch (refreshError) {
            if (import.meta.env.DEV) {
              console.warn("[credits] refreshClaims failed", refreshError);
            }
          }
        }
        const tokenPro =
          token.claims.unlimitedCredits === true ||
          token.claims.unlimited === true ||
          token.claims.admin === true ||
          token.claims.staff === true;
        if (!alive) return;
        setUnlimitedFromToken(Boolean(tokenPro));
        setLoading(false);
      } catch (err: any) {
        if (!alive) return;
        setError(err?.message ? String(err.message) : "credits_token_failed");
        setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [authReady, user]);

  useEffect(() => {
    if (!uid) return;
    if (!db) {
      setError("firestore_unavailable");
      setLoading(false);
      return;
    }

    setLoading(true);
    const ref = doc(db, `users/${uid}/private/credits`);
    const userRef = doc(db, "users", uid);
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
    const unsubUser = onSnapshot(
      userRef,
      (snap) => {
        setUnlimitedFromMirror((snap.data() as any)?.unlimitedCredits === true);
      },
      () => {
        // Fail closed.
        setUnlimitedFromMirror(false);
      }
    );
    return () => {
      unsub();
      unsubUser();
    };
  }, [uid, refreshTick]);

  const refresh = useCallback(() => {
    setRefreshTick((prev) => prev + 1);
  }, []);

  const unlimited = unlimitedFromToken || unlimitedFromMirror;

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
