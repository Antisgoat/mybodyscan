import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuthUser } from "@/lib/auth";
import { isPathAllowedInDemo } from "@/lib/demoFlag";
import { useDemoMode } from "./DemoModeProvider";
import { PageSkeleton } from "@/components/system/PageSkeleton";

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, authReady } = useAuthUser();
  const location = useLocation();
  const demo = useDemoMode();
  const appCheckReady = true;

  if (!authReady) {
    return <PageSkeleton label="Checking your session…" />;
  }

  // App Check removed

  if (!user) {
    if (demo && isPathAllowedInDemo(location.pathname)) {
      return <>{children}</>;
    }

    return (
      <Navigate
        to={demo ? "/welcome" : "/auth"}
        replace
        state={{ from: `${location.pathname}${location.search}` }}
      />
    );
  }

  return <>{children}</>;
}
