import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useOnboardingStatus } from "@/hooks/useOnboardingStatus";
import { LoadingOverlay } from "@/components/LoadingOverlay";
import { sanitizeReturnTo } from "@/lib/returnTo";

type PersonalizationGateProps = {
  children: ReactNode;
  returnToOverride?: string | null;
};

export default function PersonalizationGate({
  children,
  returnToOverride,
}: PersonalizationGateProps) {
  const location = useLocation();
  const { loading, personalizationCompleted } = useOnboardingStatus();

  if (loading) {
    return <LoadingOverlay label="Checking your profile…" />;
  }

  if (personalizationCompleted) {
    return <>{children}</>;
  }

  const currentPath = `${location.pathname}${location.search}${location.hash}`;
  const fallbackReturn = sanitizeReturnTo(returnToOverride) ?? currentPath;
  const encoded = encodeURIComponent(fallbackReturn);

  return <Navigate to={`/onboarding?returnTo=${encoded}`} replace />;
}
