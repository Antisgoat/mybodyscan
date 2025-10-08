import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuthUser } from "@/lib/auth";
import { isPathAllowedInDemo } from "@/lib/demoFlag";
import { useDemoMode } from "./DemoModeProvider";
import { LoadingOverlay } from "@/components/LoadingOverlay";
import { useAppCheckReady } from "@/components/AppCheckProvider";

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuthUser();
  const location = useLocation();
  const demo = useDemoMode();
  const appCheckReady = useAppCheckReady();

  if (loading || !appCheckReady) {
    return <LoadingOverlay label="Loading secure content…" className="min-h-screen" />;
  }

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
