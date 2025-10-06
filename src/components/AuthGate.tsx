import { ReactNode, useEffect, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { auth, functions } from "@/lib/firebase";
import { isDemoMode } from "@/lib/demoFlag";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

export default function AuthGate({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
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
  }, [user]);

  // Show loading spinner while checking auth state
  if (user === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-muted border-t-primary animate-spin" />
      </div>
    );
  }

  return <>{children}</>;
}