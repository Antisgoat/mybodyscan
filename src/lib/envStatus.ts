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
  workoutsConfigured: boolean;
  workoutAdjustConfigured: boolean;
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
  openaiKeyPresent?: boolean;
  nutritionRpmPresent?: boolean;
  usdaKeyPresent?: boolean;
  coachRpmPresent?: boolean;
  stripeSecretPresent?: boolean;
  workoutsConfigured?: boolean;
  workoutAdjustConfigured?: boolean;
  scanServicesHealthy?: boolean;
};

export function computeFeatureStatuses(remoteHealth?: RemoteHealth): FeatureStatusSummary {
  const functionsUrl = readEnv("VITE_FUNCTIONS_URL");
  const functionsOrigin = readEnv("VITE_FUNCTIONS_ORIGIN") || readEnv("VITE_FUNCTIONS_BASE_URL");
  const projectId = readEnv("VITE_FIREBASE_PROJECT_ID") || readEnv("FIREBASE_PROJECT_ID");
  const scanStartUrl = readEnv("VITE_SCAN_START_URL");
  const stripeKey = readEnv("VITE_STRIPE_PUBLISHABLE_KEY") || readEnv("VITE_STRIPE_PK");
  const coachRpm = readEnv("VITE_COACH_RPM");
  const healthConnector = readEnv("VITE_HEALTH_CONNECT");

  const firebaseReady = firebaseConfigMissingKeys.length === 0;
  const functionsConfigured = Boolean(functionsUrl || functionsOrigin || projectId);
  const openaiConfigured = remoteHealth?.openaiConfigured ?? remoteHealth?.openaiKeyPresent;
  const scanConfigured =
    typeof remoteHealth?.scanConfigured === "boolean"
      ? remoteHealth.scanConfigured
      : Boolean(openaiConfigured || functionsConfigured || scanStartUrl);
  const stripeMode = describeStripeEnvironment();
  const stripeConfigured =
    stripeMode !== "missing" || remoteHealth?.stripeSecretPresent === true || Boolean(stripeKey);
  const coachConfigured =
    typeof remoteHealth?.coachConfigured === "boolean"
      ? remoteHealth.coachConfigured
      : Boolean(remoteHealth?.coachRpmPresent || openaiConfigured || coachRpm);
  const workoutsConfigured =
    typeof remoteHealth?.workoutsConfigured === "boolean" ? remoteHealth.workoutsConfigured : functionsConfigured;
  const workoutAdjustConfigured =
    typeof remoteHealth?.workoutAdjustConfigured === "boolean"
      ? remoteHealth.workoutAdjustConfigured
      : Boolean(
          workoutsConfigured &&
            (remoteHealth?.openaiConfigured ?? remoteHealth?.openaiKeyPresent ?? openaiConfigured ?? false),
        );
  const nutritionConfigured =
    remoteHealth?.nutritionConfigured ??
    remoteHealth?.usdaKeyPresent ??
    remoteHealth?.nutritionRpmPresent ??
    Boolean(functionsConfigured);
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
      detail: scanConfigured
        ? undefined
        : openaiConfigured === false
          ? "AI engine unavailable; configure OPENAI_API_KEY."
          : "Set VITE_FUNCTIONS_URL or VITE_SCAN_START_URL.",
    },
    {
      id: "workouts",
      label: "Workouts",
      configured: workoutsConfigured,
      okLabel: "Functions ready",
      warnLabel: "Functions URL missing",
      detail: workoutsConfigured
        ? workoutAdjustConfigured
          ? undefined
          : "AI adjustments limited until OPENAI_API_KEY is configured."
        : "Set VITE_FUNCTIONS_URL or VITE_FUNCTIONS_ORIGIN to enable workout APIs.",
    },
    {
      id: "coach",
      label: "Coach chat",
      configured: coachConfigured,
      okLabel: "Enabled",
      warnLabel: "COACH_RPM missing",
      detail: coachConfigured
        ? undefined
        : openaiConfigured === false
          ? "AI engine unavailable; configure OPENAI_API_KEY."
          : "Set COACH_RPM to un-throttle chat completions.",
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
    workoutsConfigured,
    workoutAdjustConfigured,
    nutritionConfigured,
    healthConfigured,
  };
}
