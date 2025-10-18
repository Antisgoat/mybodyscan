import { ReactNode, useEffect } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "@app/lib/firebase.ts";
import { isDemoMode } from "@app/lib/demoFlag.tsx";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@app/lib/firebase.ts";
import { useAuthUser } from "@app/lib/auth.ts";
import { useAppCheckReady } from "@app/components/AppCheckProvider.tsx";
import { PageSkeleton } from "@app/components/system/PageSkeleton.tsx";

export default function AuthGate({ children }: { children: ReactNode }) {
  const { user, authReady } = useAuthUser();
  const appCheckReady = useAppCheckReady();

  useEffect(() => {
    if (!authReady || !user) return;
    const demo = isDemoMode(user, window.location);
    if (demo) {
      // Ensure demo users have at least 2 credits in profile for gating UX
      (async () => {
        try {
          const profileRef = doc(db, "users", user.uid, "profile");
          const snap = await getDoc(profileRef);
          const current = (snap.exists() ? (snap.data() as any)?.credits : undefined) as number | undefined;
          if (typeof current !== "number") {
            await setDoc(profileRef, { credits: 2 }, { merge: true });
          }
        } catch (_) {
          // non-fatal in demo
        }
      })();
      return;
    }
    const ensureCredits = httpsCallable(functions, "ensureTestCredits");
    ensureCredits({ demo }).catch(() => {});
  }, [authReady, user]);

  if (!authReady) {
    const path = typeof window !== 'undefined' ? window.location.pathname : '';
    // Allow demo deep-link to render immediately to avoid hanging before auth is ready
    if (path.startsWith('/demo')) {
      return <>{children}</>;
    }
    return <PageSkeleton label="Signing you in…" />;
  }

  if (!appCheckReady) {
    return <PageSkeleton label="Securing your session…" />;
  }

  return <>{children}</>;
}
