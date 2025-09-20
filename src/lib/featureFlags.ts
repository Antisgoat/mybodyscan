import { ReactNode } from 'react';

const FEATURE_ENV_MAP = {
  scan: import.meta.env.VITE_FEATURE_SCAN,
  nutrition: import.meta.env.VITE_FEATURE_NUTRITION,
  workouts: import.meta.env.VITE_FEATURE_WORKOUTS,
  coach: import.meta.env.VITE_FEATURE_COACH,
  health: import.meta.env.VITE_FEATURE_HEALTH,
  reminders: import.meta.env.VITE_FEATURE_REMINDERS,
  i18n: import.meta.env.VITE_FEATURE_I18N,
  marketing: import.meta.env.VITE_FEATURE_MARKETING,
  account: import.meta.env.VITE_FEATURE_ACCOUNT,
} as const;

export type FeatureName = keyof typeof FEATURE_ENV_MAP;

function parseFlag(value: string | undefined, fallback = true): boolean {
  if (typeof value === 'string') {
    const lowered = value.toLowerCase();
    if (lowered === '1' || lowered === 'true' || lowered === 'yes') {
      return true;
    }
    if (lowered === '0' || lowered === 'false' || lowered === 'no') {
      return false;
    }
  }
  return fallback;
}

const resolvedFlags = Object.fromEntries(
  (Object.keys(FEATURE_ENV_MAP) as FeatureName[]).map((key) => [
    key,
    parseFlag(FEATURE_ENV_MAP[key]),
  ]),
) as Record<FeatureName, boolean>;

export function isFeatureEnabled(name: FeatureName): boolean {
  return resolvedFlags[name];
}

export function getFeatureFlags(): Record<FeatureName, boolean> {
  return { ...resolvedFlags };
}

interface FeatureGateProps {
  name: FeatureName;
  fallback?: ReactNode;
  children: ReactNode;
}

export function FeatureGate({ name, fallback = null, children }: FeatureGateProps) {
  if (!isFeatureEnabled(name)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
