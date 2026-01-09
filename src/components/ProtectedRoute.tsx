import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuthPhase, useAuthUser } from "@/auth/facade";
import { isDemoActive } from "@/lib/demo";
import { isPathAllowedInDemo } from "@/lib/demoFlag";
import { useDemoMode } from "./DemoModeProvider";
import { PageSkeleton } from "@/components/system/PageSkeleton";
import { reportError } from "@/lib/telemetry";
import { useEffect, useRef } from "react";

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  return <ProtectedRouteInner>{children}</ProtectedRouteInner>;
}

function ProtectedRouteInner({ children }: { children: ReactNode }) {
  const { user, authReady } = useAuthUser();
  const phase = useAuthPhase();
  const location = useLocation();
  const authed = !!user;
  const demoEnabled = useDemoMode();
  const demoActive = !authed && demoEnabled && isDemoActive();
  const allowDemo = demoActive && isPathAllowedInDemo(location.pathname);
  const lastDecisionKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const nextTarget = `${location.pathname}${location.search}`;
    const destination = `/auth?next=${encodeURIComponent(nextTarget)}`;
    const decision = !authReady
      ? "booting"
      : authed
        ? "allow_authed"
        : allowDemo
          ? "allow_demo"
          : "redirect_auth";
    const key = `${decision}:${location.pathname}:${location.search}`;
    if (lastDecisionKeyRef.current === key) return;
    lastDecisionKeyRef.current = key;
    void reportError({
      kind: "auth.route_guard_decision",
      message: "auth.route_guard_decision",
      extra: {
        phase,
        pathname: location.pathname,
        authed,
        demoEnabled,
        demoActive,
        allowDemo,
        destination: decision === "redirect_auth" ? destination : null,
      },
    });
  }, [
    authReady,
    authed,
    allowDemo,
    demoActive,
    demoEnabled,
    location.pathname,
    location.search,
    phase,
  ]);

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
