export type FeatureName =
  | 'scan'
  | 'nutrition'
  | 'workouts'
  | 'coach'
  | 'health'
  | 'reminders'
  | 'i18n'
  | 'marketing'
  | 'account';

const FEATURE_ENV_KEYS: Record<FeatureName, string> = {
  scan: 'VITE_FEATURE_SCAN',
  nutrition: 'VITE_FEATURE_NUTRITION',
  workouts: 'VITE_FEATURE_WORKOUTS',
  coach: 'VITE_FEATURE_COACH',
  health: 'VITE_FEATURE_HEALTH',
  reminders: 'VITE_FEATURE_REMINDERS',
  i18n: 'VITE_FEATURE_I18N',
  marketing: 'VITE_FEATURE_MARKETING',
  account: 'VITE_FEATURE_ACCOUNT',
};

function readFlag(key: string): boolean {
  const value = (import.meta as any)?.env?.[key] ?? (globalThis as any)?.[key];
  if (typeof value === 'string') {
    const normalized = value.toLowerCase();
    if (normalized === '1' || normalized === 'true' || normalized === 'yes') {
      return true;
    }
    if (normalized === '0' || normalized === 'false' || normalized === 'no') {
      return false;
    }
  }
  if (typeof value === 'boolean') {
    return value;
  }
  return true;
}

export function isFeatureEnabled(name: FeatureName): boolean {
  return readFlag(FEATURE_ENV_KEYS[name]);
}

export function getAllFeatureFlags(): Record<FeatureName, boolean> {
  const names: FeatureName[] = [
    'scan',
    'nutrition',
    'workouts',
    'coach',
    'health',
    'reminders',
    'i18n',
    'marketing',
    'account',
  ];

  return Object.fromEntries(names.map((name) => [name, isFeatureEnabled(name)])) as Record<FeatureName, boolean>;
}
