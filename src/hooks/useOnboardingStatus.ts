import { useEffect, useMemo, useState } from "react";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { db, requireAuth } from "@/lib/firebase";
import { isNative } from "@/lib/platform";

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

  useEffect(() => {
    if (isNative()) {
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

    let unsubscribeAuth: (() => void) | null = null;
    void (async () => {
      const auth = await requireAuth().catch(() => null);
      if (!auth || !db || cancelled) {
        setState({
          authResolved: true,
          metaLoading: false,
          personalizationCompleted: false,
          hasDraft: false,
          hasRootData: false,
        });
        return;
      }
      const { onAuthStateChanged } = await import("firebase/auth");
      unsubscribeAuth = onAuthStateChanged(auth, (user) => {
        if (cancelled) return;
        if (unsubscribeMeta) {
          unsubscribeMeta();
          unsubscribeMeta = null;
        }

        if (!user) {
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
      },
      () => {
        if (cancelled) return;
        setState({
          authResolved: true,
          metaLoading: false,
          personalizationCompleted: false,
          hasDraft: false,
          hasRootData: false,
        });
      }
      );
    })();

    return () => {
      cancelled = true;
      if (unsubscribeMeta) unsubscribeMeta();
      if (unsubscribeAuth) unsubscribeAuth();
    };
  }, []);

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
