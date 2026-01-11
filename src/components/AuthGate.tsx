import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { getFirebaseInitError, hasFirebaseConfig } from "@/lib/firebase";
import { useAuthUser } from "@/auth/client";

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, authReady } = useAuthUser();
  const location = useLocation();

  if (!hasFirebaseConfig) {
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

  if (!authReady) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  }

  if (!user) {
    if (location.pathname === "/login" || location.pathname === "/auth") {
      return null;
    }
    const nextTarget = `${location.pathname}${location.search}`;
    const destination = `/auth?next=${encodeURIComponent(nextTarget)}`;
    return <Navigate to={destination} replace state={{ from: nextTarget }} />;
  }

  return <>{children}</>;
}
