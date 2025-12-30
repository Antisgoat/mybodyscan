import { useCallback, useEffect, useRef, useState } from "react";
import { onIdTokenChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth as firebaseAuth, db, getFirebaseConfig } from "@/lib/firebase";
import { call } from "@/lib/callable";
import { useEntitlements } from "@/lib/entitlements/store";
import { hasPro, type Entitlements } from "@/lib/entitlements/pro";

export function useCredits() {
  const [credits, setCredits] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [proFromToken, setProFromToken] = useState(false);
  const [proFromMirror, setProFromMirror] = useState(false);
  const refreshAttemptRef = useRef<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const { entitlements: firestoreEntitlements } = useEntitlements();
  let projectId = "";
  try {
    projectId = getFirebaseConfig().projectId;
  } catch {
    projectId = "";
  }

  useEffect(() => {
    if (!firebaseAuth) {
      setError("auth_unavailable");
      setLoading(false);
      return undefined;
    }
    const unsubscribe = onIdTokenChanged(
      firebaseAuth,
      async (u) => {
        setUid(u?.uid ?? null);
        if (!u) {
          setCredits(0);
          setProFromToken(false);
          setProFromMirror(false);
          setLoading(false);
          refreshAttemptRef.current = null;
        } else {
          let token = await u.getIdTokenResult();
          if (refreshAttemptRef.current !== u.uid) {
            refreshAttemptRef.current = u.uid;
            try {
              await call("refreshClaims");
              token = await u.getIdTokenResult(true);
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
          setProFromToken(Boolean(tokenPro));
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
        setProFromMirror((snap.data() as any)?.unlimitedCredits === true);
      },
      () => {
        // Fail closed.
        setProFromMirror(false);
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

  const effectiveEntitlements: Entitlements =
    proFromToken || proFromMirror
      ? { pro: true, source: "admin", expiresAt: null }
      : firestoreEntitlements;

  const unlimited = hasPro(effectiveEntitlements);

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
