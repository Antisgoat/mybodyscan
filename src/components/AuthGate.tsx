import { ReactNode, useEffect, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { auth, functions } from "@/lib/firebase";
import { isDemoMode } from "@/lib/demoFlag";

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
    if (demo) return;
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