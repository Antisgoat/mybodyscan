import { ReactNode } from 'react';
import { isFeatureEnabled, type FeatureName } from '@/lib/featureFlags';

type FeatureGateProps = {
  name: FeatureName;
  fallback?: ReactNode;
  children?: ReactNode;
};

export function FeatureGate({ name, fallback = null, children }: FeatureGateProps) {
  if (!isFeatureEnabled(name)) {
    return <>{fallback}</>;
  }
  return <>{children}</>;
}

export default FeatureGate;
