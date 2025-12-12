import React, { useEffect, useState } from "react";
import {
  getFirebaseInitError,
  hasFirebaseConfig,
  initFirebase,
} from "@/lib/firebase";
import { onAuthStateChanged, type User } from "firebase/auth";

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const { auth } = initFirebase();
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    if (!auth) {
      setUser(null);
      return undefined;
    }
    const unsubscribe = onAuthStateChanged(auth, (next) => {
      setUser(next);
    });
    return () => {
      unsubscribe();
    };
  }, [auth]);

  if (user === undefined) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  }

  if (!auth) {
    const reason =
      getFirebaseInitError() ||
      (hasFirebaseConfig
        ? "Authentication unavailable."
        : "Firebase not configured.");
    return (
      <div className="p-6 text-sm text-muted-foreground">
        {reason} Please reload or use the demo experience.
      </div>
    );
  }

  if (!user) {
    if (
      typeof window !== "undefined" &&
      window.location.pathname !== "/login"
    ) {
      window.location.href = "/login";
    }
    return null;
  }

  return <>{children}</>;
}
