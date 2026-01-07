import { useEffect, useMemo, useState } from "react";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuthUser } from "@/lib/authFacade";

type InternalState = {
  authResolved: boolean;
  metaLoading: boolean;
  personalizationCompleted: boolean;
  hasDraft: boolean;
  hasRootData: boolean;
};

const initialState: InternalState = {
  authResolved: false,
  metaLoading: true,
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
  const uid = user?.uid ?? null;

  useEffect(() => {
    if (!authReady || !db) {
      setState((prev) => ({ ...prev, authResolved: false, metaLoading: true }));
      return;
    }

    if (!uid) {
      setState({
        authResolved: true,
        metaLoading: false,
        personalizationCompleted: false,
        hasDraft: false,
        hasRootData: false,
      });
      return;
    }

    setState({
      authResolved: true,
      metaLoading: true,
      personalizationCompleted: false,
      hasDraft: false,
      hasRootData: false,
    });

    const metaRef = doc(db, "users", uid, "meta", "onboarding");
    const unsubscribeMeta = onSnapshot(
      metaRef,
      (snapshot) => {
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
        setState((prev) => ({
          ...prev,
          metaLoading: false,
          personalizationCompleted: false,
          hasDraft: false,
        }));
      }
    );

    void getDoc(doc(db, "users", uid))
      .then((userDoc) => {
        const hasRootData = hasNonEmptyObject(userDoc.data()?.onboarding);
        setState((prev) => ({ ...prev, hasRootData }));
      })
      .catch(() => {
        setState((prev) => ({ ...prev, hasRootData: false }));
      });

    return () => {
      unsubscribeMeta();
    };
  }, [authReady, uid]);

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
