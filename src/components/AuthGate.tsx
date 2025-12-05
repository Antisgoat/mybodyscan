import React, { useEffect, useState } from "react";
import { type User } from "firebase/auth";

import { auth, onAuthStateChangedSafe } from "@/lib/firebase";

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(() => auth?.currentUser ?? undefined);

  useEffect(() => {
    const unsubscribe = onAuthStateChangedSafe((next) => {
      setUser(next);
    });
    return () => {
      unsubscribe();
    };
  }, []);

  if (user === undefined) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  }

  if (!user) {
    if (typeof window !== "undefined" && window.location.pathname !== "/login") {
      window.location.href = "/login";
    }
    return null;
  }

  return <>{children}</>;
}
