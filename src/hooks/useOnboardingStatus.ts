import { useEffect, useMemo, useState } from "react";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuthUser } from "@/lib/auth";

type InternalState = {
  authResolved: boolean;
  metaLoading: boolean;
  personalizationCompleted: boolean;
  hasDraft: boolean;
  hasRootData: boolean;
};

const initialState: InternalState = {
  authResolved: false,
  metaLoading: false,
  personalizationCompleted: false,
  hasDraft: false,
  hasRootData: false,
};

const hasNonEmptyObject = (value: unknown): boolean => {
  if (!value || typeof value !== "object") return false;
  return Object.keys(value as Record<string, unknown>).length > 0;
};

export function useOnboardingStatus() {
  const [state, setState] = useState<InternalState>(initialState);
  const { user, authReady } = useAuthUser();

  useEffect(() => {
    if (!authReady) {
      setState((prev) => ({ ...prev, authResolved: false, metaLoading: false }));
      return;
    }

    if (!db) {
      setState({
        authResolved: true,
        metaLoading: false,
        personalizationCompleted: false,
        hasDraft: false,
        hasRootData: false,
      });
      return;
    }

    let unsubscribeMeta: (() => void) | null = null;
    let cancelled = false;

    if (!user?.uid) {
      setState({
        authResolved: true,
        metaLoading: false,
        personalizationCompleted: false,
        hasDraft: false,
        hasRootData: false,
      });
      return () => {
        cancelled = true;
        if (unsubscribeMeta) unsubscribeMeta();
      };
    }

    setState({
      authResolved: true,
      metaLoading: true,
      personalizationCompleted: false,
      hasDraft: false,
      hasRootData: false,
    });

    const metaRef = doc(db, "users", user.uid, "meta", "onboarding");
    unsubscribeMeta = onSnapshot(
      metaRef,
      (snapshot) => {
        if (cancelled) return;
        const data = snapshot.exists() ? snapshot.data() : null;
        const completed = data?.completed === true;
        const hasDraft = hasNonEmptyObject(data?.draft);
        setState((prev) => ({
          ...prev,
          metaLoading: false,
          personalizationCompleted: completed,
          hasDraft,
        }));
      },
      () => {
        if (cancelled) return;
        setState((prev) => ({
          ...prev,
          metaLoading: false,
          personalizationCompleted: false,
          hasDraft: false,
        }));
      }
    );

    void getDoc(doc(db, "users", user.uid))
      .then((userDoc) => {
        if (cancelled) return;
        const hasRootData = hasNonEmptyObject(userDoc.data()?.onboarding);
        setState((prev) => ({
          ...prev,
          hasRootData,
        }));
      })
      .catch(() => {
        if (cancelled) return;
        setState((prev) => ({
          ...prev,
          hasRootData: false,
        }));
      });

    return () => {
      cancelled = true;
      if (unsubscribeMeta) unsubscribeMeta();
    };
  }, [authReady, user?.uid]);

  return useMemo(() => {
    const loading = !state.authResolved || state.metaLoading;
    const hasAnyOnboardingData =
      state.personalizationCompleted || state.hasDraft || state.hasRootData;
    return {
      loading,
      personalizationCompleted: state.personalizationCompleted,
      hasAnyOnboardingData,
    };
  }, [state]);
}

export type OnboardingStatus = ReturnType<typeof useOnboardingStatus>;
