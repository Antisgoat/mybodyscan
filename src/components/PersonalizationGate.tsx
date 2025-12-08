import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useOnboardingStatus } from "@/hooks/useOnboardingStatus";
import { useCredits } from "@/hooks/useCredits";
import { useSubscription } from "@/hooks/useSubscription";
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
  const { loading: onboardingLoading, personalizationCompleted } = useOnboardingStatus();
  const {
    loading: creditsLoading,
    unlimited,
    credits,
  } = useCredits();
  const { isActive, loading: subscriptionLoading } = useSubscription();

  const hasPremiumAccess = unlimited || credits > 0 || isActive;
  const loading = onboardingLoading || creditsLoading || subscriptionLoading;

  if (loading) {
    return <LoadingOverlay label="Checking your profile…" />;
  }

  if (!hasPremiumAccess || personalizationCompleted) {
    return <>{children}</>;
  }

  const currentPath = `${location.pathname}${location.search}${location.hash}`;
  const fallbackReturn = sanitizeReturnTo(returnToOverride) ?? currentPath;
  const encoded = encodeURIComponent(fallbackReturn);

  return <Navigate to={`/onboarding?returnTo=${encoded}`} replace />;
}
