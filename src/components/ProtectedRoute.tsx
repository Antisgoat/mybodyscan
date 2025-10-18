import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuthUser } from "@app/lib/auth.ts";
import { isPathAllowedInDemo } from "@app/lib/demoFlag.tsx";
import { useDemoMode } from "./DemoModeProvider.tsx";
import { useAppCheckReady } from "@app/components/AppCheckProvider.tsx";
import { PageSkeleton } from "@app/components/system/PageSkeleton.tsx";

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, authReady } = useAuthUser();
  const location = useLocation();
  const demo = useDemoMode();
  const appCheckReady = useAppCheckReady();

  if (!authReady) {
    return <PageSkeleton label="Checking your session…" />;
  }

  if (!appCheckReady) {
    return <PageSkeleton label="Preparing secure access…" />;
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
