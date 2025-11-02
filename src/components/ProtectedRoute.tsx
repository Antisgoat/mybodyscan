import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuthUser } from "@/lib/auth";
import { isPathAllowedInDemo } from "@/lib/demoFlag";
import { useDemoMode } from "./DemoModeProvider";
import { PageSkeleton } from "@/components/system/PageSkeleton";
import AuthGate from "./AuthGate";

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  return (
    <AuthGate>
      <ProtectedRouteInner>{children}</ProtectedRouteInner>
    </AuthGate>
  );
}

function ProtectedRouteInner({ children }: { children: ReactNode }) {
  const { user, authReady } = useAuthUser();
  const location = useLocation();
  const demo = useDemoMode();

  if (!authReady) {
    return <PageSkeleton label="Checking your session…" />;
  }

  if (!user) {
    if (demo && isPathAllowedInDemo(location.pathname)) {
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
