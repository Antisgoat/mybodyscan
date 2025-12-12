import { ReactNode } from "react";

import { isFeatureEnabled, type FeatureName } from "@/lib/featureFlags";
import { useFlags } from "@/lib/flags";

type FeatureGateProps = {
  name: FeatureName;
  fallback?: ReactNode;
  children?: ReactNode;
};

export function FeatureGate({
  name,
  fallback = null,
  children,
}: FeatureGateProps) {
  const { flags } = useFlags();
  const remoteAllowed =
    name === "coach"
      ? flags.enableCoach
      : name === "nutrition"
        ? flags.enableNutrition
        : true;
  if (!remoteAllowed || !isFeatureEnabled(name)) {
    return <>{fallback}</>;
  }
  return <>{children}</>;
}

export default FeatureGate;
