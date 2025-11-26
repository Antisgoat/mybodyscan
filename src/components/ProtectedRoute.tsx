import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuthUser } from "@/lib/auth";
import { isDemoActive } from "@/lib/demo";
import { isPathAllowedInDemo } from "@/lib/demoFlag";
import { useDemoMode } from "./DemoModeProvider";
import { PageSkeleton } from "@/components/system/PageSkeleton";

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  return <ProtectedRouteInner>{children}</ProtectedRouteInner>;
}

function ProtectedRouteInner({ children }: { children: ReactNode }) {
  const { user, authReady } = useAuthUser();
  const location = useLocation();
  const authed = !!user;
  const demoEnabled = useDemoMode();
  const demoActive = !authed && demoEnabled && isDemoActive();
  const allowDemo = demoActive && isPathAllowedInDemo(location.pathname);

  if (!authReady) {
    return <PageSkeleton label="Checking your session…" />;
  }

  if (!user) {
    if (allowDemo) {
      return <>{children}</>;
    }

    const nextTarget = `${location.pathname}${location.search}`;
    const destination = `/auth?next=${encodeURIComponent(nextTarget)}`;

    return <Navigate to={destination} replace state={{ from: nextTarget }} />;
  }

  return <>{children}</>;
}
