import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuthUser } from "@/lib/auth";
import { isDemo, isPathAllowedInDemo } from "@/lib/demoFlag";
import { useDemoMode } from "./DemoModeProvider";
import { PageSkeleton } from "@/components/system/PageSkeleton";

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  return <ProtectedRouteInner>{children}</ProtectedRouteInner>;
}

function ProtectedRouteInner({ children }: { children: ReactNode }) {
  const { user, authReady } = useAuthUser();
  const location = useLocation();
  const demoContext = useDemoMode();
  const demo = demoContext || isDemo();
  const allowDemo = demo && isPathAllowedInDemo(location.pathname);

  if (!authReady) {
    return <PageSkeleton label="Checking your session…" />;
  }

  if (!user) {
    if (allowDemo) {
      return <>{children}</>;
    }

    return (
      <Navigate
        to={demo ? "/welcome" : "/login"}
        replace
        state={{ from: `${location.pathname}${location.search}` }}
      />
    );
  }

  return <>{children}</>;
}
