import { describeStripeEnvironment } from "@/lib/env";
import { firebaseConfigMissingKeys } from "@/lib/firebase";

type FeatureStatusId =
  | "firebase"
  | "scans"
  | "workouts"
  | "coach"
  | "nutrition"
  | "stripe"
  | "health";

export type FeatureStatus = {
  id: FeatureStatusId;
  label: string;
  configured: boolean;
  okLabel: string;
  warnLabel: string;
  detail?: string;
};

export type FeatureStatusSummary = {
  statuses: FeatureStatus[];
  stripeMode: ReturnType<typeof describeStripeEnvironment>;
  stripeConfigured: boolean;
  functionsConfigured: boolean;
  scanConfigured: boolean;
  coachConfigured: boolean;
  nutritionConfigured: boolean;
  healthConfigured: boolean;
};

const envSource: Record<string, string | undefined> = (import.meta as any)?.env ?? {};

const readEnv = (key: string): string => {
  const raw = envSource[key];
  return typeof raw === "string" ? raw.trim() : "";
};

export type RemoteHealth = {
  scanConfigured?: boolean;
  coachConfigured?: boolean;
  nutritionConfigured?: boolean;
  openaiConfigured?: boolean;
};

export function computeFeatureStatuses(remoteHealth?: RemoteHealth): FeatureStatusSummary {
  const functionsUrl = readEnv("VITE_FUNCTIONS_URL");
  const scanStartUrl = readEnv("VITE_SCAN_START_URL");
  const stripeKey = readEnv("VITE_STRIPE_PUBLISHABLE_KEY") || readEnv("VITE_STRIPE_PK");
  const coachRpm = readEnv("VITE_COACH_RPM");
  const healthConnector = readEnv("VITE_HEALTH_CONNECT");

  const firebaseReady = firebaseConfigMissingKeys.length === 0;
  const functionsConfigured = Boolean(functionsUrl);
  const scanConfigured = remoteHealth?.scanConfigured ?? (functionsConfigured || Boolean(scanStartUrl));
  const stripeMode = describeStripeEnvironment();
  const stripeConfigured = stripeMode !== "missing";
  const coachConfigured = remoteHealth?.coachConfigured ?? Boolean(coachRpm);
  const nutritionConfigured = remoteHealth?.nutritionConfigured ?? Boolean(functionsConfigured);
  const healthConfigured = Boolean(healthConnector);

  const statuses: FeatureStatus[] = [
    {
      id: "firebase",
      label: "Firebase auth & config",
      configured: firebaseReady,
      okLabel: "Ready",
      warnLabel: "Missing keys",
      detail: firebaseReady
        ? "Using baked-in Firebase web config."
        : `Missing: ${firebaseConfigMissingKeys.join(", ")}`,
    },
    {
      id: "scans",
      label: "Body scans",
      configured: scanConfigured,
      okLabel: "Configured",
      warnLabel: "Missing URL",
      detail: scanConfigured ? undefined : "Set VITE_FUNCTIONS_URL or VITE_SCAN_START_URL.",
    },
    {
      id: "workouts",
      label: "Workouts",
      configured: functionsConfigured,
      okLabel: "Functions ready",
      warnLabel: "Functions URL missing",
      detail: functionsConfigured ? undefined : "Set VITE_FUNCTIONS_URL to enable workout APIs.",
    },
    {
      id: "coach",
      label: "Coach chat",
      configured: coachConfigured,
      okLabel: "Enabled",
      warnLabel: "COACH_RPM missing",
      detail: coachConfigured ? undefined : "Set COACH_RPM to un-throttle chat completions.",
    },
    {
      id: "nutrition",
      label: "Meals search",
      configured: nutritionConfigured,
      okLabel: "Enabled",
      warnLabel: "Keys missing",
      detail: nutritionConfigured
        ? undefined
        : "Provide USDA/OpenFoodFacts keys or NUTRITION_RPM to enable food lookups.",
    },
    {
      id: "stripe",
      label: "Plans & billing",
      configured: stripeConfigured,
      okLabel:
        stripeMode === "live"
          ? "Stripe live"
          : stripeMode === "test"
            ? "Stripe test"
            : stripeMode === "custom"
              ? "Custom key"
              : "Stripe ready",
      warnLabel: "Stripe key missing",
      detail: stripeConfigured ? undefined : "Set VITE_STRIPE_PUBLISHABLE_KEY or VITE_STRIPE_PK.",
    },
    {
      id: "health",
      label: "Health sync",
      configured: healthConfigured,
      okLabel: "Configured",
      warnLabel: "Coming soon",
      detail: healthConfigured
        ? "Connector flag detected."
        : "Health connectors are intentionally disabled until native integrations ship.",
    },
  ];

  return {
    statuses,
    stripeMode,
    stripeConfigured,
    functionsConfigured,
    scanConfigured,
    coachConfigured,
    nutritionConfigured,
    healthConfigured,
  };
}
