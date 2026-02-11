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

const envSource: Record<string, string | undefined> =
  (import.meta as any)?.env ?? {};

const readEnv = (key: string): string => {
  const raw = envSource[key];
  return typeof raw === "string" ? raw.trim() : "";
};

export type RemoteHealth = {
  scanConfigured?: boolean;
  scanEngineConfigured?: boolean;
  scanEngineMissing?: string[];
  storageBucket?: string | null;
  storageBucketSource?: string | null;
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
  functionsReachable?: boolean;
};

export function computeFeatureStatuses(
  remoteHealth?: RemoteHealth
): FeatureStatusSummary {
  const projectId =
    readEnv("VITE_FIREBASE_PROJECT_ID") || readEnv("FIREBASE_PROJECT_ID");
  const scanStartUrl = readEnv("VITE_SCAN_START_URL");
  const scanEngineConfigured = remoteHealth?.scanEngineConfigured;
  const stripeKey =
    readEnv("VITE_STRIPE_PUBLISHABLE_KEY") || readEnv("VITE_STRIPE_PK");
  const healthConnector = readEnv("VITE_HEALTH_CONNECT");

  const firebaseReady = firebaseConfigMissingKeys.length === 0;
  const functionsConfigured = Boolean(projectId);
  const functionsReachable =
    typeof remoteHealth?.functionsReachable === "boolean"
      ? remoteHealth.functionsReachable
      : undefined;
  const openaiConfigured =
    typeof remoteHealth?.openaiConfigured === "boolean"
      ? remoteHealth.openaiConfigured
      : typeof remoteHealth?.openaiKeyPresent === "boolean"
        ? remoteHealth.openaiKeyPresent
        : undefined;
  const scanConfigured =
    typeof scanEngineConfigured === "boolean"
      ? scanEngineConfigured &&
        (typeof remoteHealth?.scanConfigured === "boolean"
          ? remoteHealth.scanConfigured
          : true)
      : typeof remoteHealth?.scanConfigured === "boolean"
        ? remoteHealth.scanConfigured
        : functionsReachable === false
          ? false
          : true;
  const stripeMode = describeStripeEnvironment();
  const stripeConfigured =
    stripeMode !== "missing" ||
    remoteHealth?.stripeSecretPresent === true ||
    Boolean(stripeKey);
  // Coach should not hard-disable the UI when health is unknown.
  // If the server explicitly reports "not configured", respect it; otherwise be optimistic
  // when Functions look reachable, and let runtime errors surface via toasts.
  const coachConfigured =
    typeof remoteHealth?.coachConfigured === "boolean"
      ? remoteHealth.coachConfigured
      : typeof openaiConfigured === "boolean"
        ? openaiConfigured
        : functionsReachable === false
          ? false
          : functionsConfigured;
  const workoutsConfigured =
    typeof remoteHealth?.workoutsConfigured === "boolean"
      ? remoteHealth.workoutsConfigured
      : functionsReachable === false
        ? false
        : functionsConfigured;
  const workoutAdjustConfigured =
    typeof remoteHealth?.workoutAdjustConfigured === "boolean"
      ? remoteHealth.workoutAdjustConfigured
      : Boolean(
          workoutsConfigured &&
            (remoteHealth?.openaiConfigured ??
              remoteHealth?.openaiKeyPresent ??
              openaiConfigured ??
              false)
        );
  const nutritionConfigured =
    typeof remoteHealth?.nutritionConfigured === "boolean"
      ? remoteHealth.nutritionConfigured
      : functionsReachable === false
        ? false
        : true;
  const healthConfigured = Boolean(healthConnector);

  const scanServicesHealthy = remoteHealth?.scanServicesHealthy;
  const usdaKeyPresent = remoteHealth?.usdaKeyPresent;
  const nutritionRpmPresent = remoteHealth?.nutritionRpmPresent;
  const coachRpmPresent = remoteHealth?.coachRpmPresent;

  const firebaseDetail = firebaseReady
    ? "Using baked-in Firebase web config."
    : `Missing: ${firebaseConfigMissingKeys.join(", ")}. Add the Firebase web keys to .env.production.local.`;

  const scanWarnLabel =
    openaiConfigured === false ? "OpenAI missing" : "Needs config";
  const scanDetail = scanConfigured
    ? scanServicesHealthy === false
      ? "Function reachable but reported unhealthy; check Cloud Functions logs."
      : undefined
    : openaiConfigured === false
      ? "Add OPENAI_API_KEY via firebase functions:secrets:set before running scans."
      : scanEngineConfigured === false && Array.isArray(remoteHealth?.scanEngineMissing)
        ? `Scan engine missing: ${remoteHealth.scanEngineMissing.join(", ")}`
        : functionsConfigured
          ? "Deploy scan handlers and confirm /api/system/health responds."
          : "Backend unavailable (Cloud Functions). Check deployment / network.";

  const workoutsDetail = workoutsConfigured
    ? workoutAdjustConfigured
      ? undefined
      : "AI adjustments disabled until OPENAI_API_KEY secret is configured."
    : "Backend unavailable (Cloud Functions). Check deployment / network.";

  const coachWarnLabel = openaiConfigured === false ? "OpenAI missing" : "Needs config";
  const coachDetail = coachConfigured
    ? undefined
    : openaiConfigured === false
      ? "Add OPENAI_API_KEY via firebase functions:secrets:set."
      : "Deploy coachChat Function and confirm /api/system/health passes.";

  const nutritionDetail = nutritionConfigured
    ? undefined
    : "Backend unavailable (Cloud Functions). Check deployment / network.";

  const stripeDetail = stripeConfigured
    ? undefined
    : "Set VITE_STRIPE_PUBLISHABLE_KEY and functions secrets STRIPE_SECRET/STRIPE_SECRET_KEY/STRIPE_WEBHOOK_SECRET.";

  const healthDetail = healthConfigured
    ? "Connector flag detected."
    : "Leave disabled until VITE_HEALTH_CONNECT is intentionally enabled.";

  const statuses: FeatureStatus[] = [
    {
      id: "firebase",
      label: "Firebase auth & config",
      configured: firebaseReady,
      okLabel: "Ready",
      warnLabel: "Missing keys",
      detail: firebaseDetail,
    },
    {
      id: "scans",
      label: "Body scans",
      configured: scanConfigured,
      okLabel: "Configured",
      warnLabel: scanWarnLabel,
      detail: scanDetail,
    },
    {
      id: "workouts",
      label: "Workouts",
      configured: workoutsConfigured,
      okLabel: "Functions ready",
      warnLabel: "Backend unavailable",
      detail: workoutsDetail,
    },
    {
      id: "coach",
      label: "Coach chat",
      configured: coachConfigured,
      okLabel: "Enabled",
      warnLabel: coachWarnLabel,
      detail: coachDetail,
    },
    {
      id: "nutrition",
      label: "Meals search",
      configured: nutritionConfigured,
      okLabel: "Enabled",
      warnLabel: "Backend unavailable",
      detail: nutritionDetail,
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
      detail: stripeDetail,
    },
    {
      id: "health",
      label: "Health sync",
      configured: healthConfigured,
      okLabel: "Configured",
      warnLabel: "Coming soon",
      detail: healthDetail,
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
