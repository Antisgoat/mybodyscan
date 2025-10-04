import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuthUser } from "@/lib/auth";
import { isPathAllowedInDemo } from "@/lib/demoFlag";
import { useDemoMode } from "./DemoModeProvider";

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuthUser();
  const location = useLocation();
  const demo = useDemoMode();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-4 border-muted border-t-primary animate-spin" aria-label="Loading" />
      </div>
    );
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
