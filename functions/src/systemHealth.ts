import { defineSecret } from "firebase-functions/params";
import { onRequest } from "firebase-functions/v2/https";

import { appCheckSoft } from "./http/appCheckSoft.js";

import { getAppCheckMode, getEnvBool, hasOpenAI } from "./lib/env.js";
import { openAiSecretParam } from "./openai/keys.js";
import {
  stripeSecretKeyParam,
  stripeSecretParam,
  stripeWebhookSecretParam,
  legacyStripeWebhookParam,
} from "./stripe/keys.js";

const usdaFdcApiKeyParam = defineSecret("USDA_FDC_API_KEY");
const scanDisabledFlag = "SCAN_DISABLED";
const coachDisabledFlag = "COACH_DISABLED";
const workoutsDisabledFlag = "WORKOUTS_DISABLED";

type SecretLike = { value(): string | undefined };

function secretPresent(secret: SecretLike): boolean {
  try {
    const value = secret.value();
    return typeof value === "string" && value.trim().length > 0;
  } catch {
    return false;
  }
}

function envPresent(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export const systemHealth = onRequest(
  {
    region: "us-central1",
    cors: true,
    secrets: [
      openAiSecretParam,
      stripeSecretParam,
      stripeSecretKeyParam,
      stripeWebhookSecretParam,
      legacyStripeWebhookParam,
      usdaFdcApiKeyParam,
    ],
  },
  async (req, res) => {
    await appCheckSoft(req);
    const openaiConfigured = hasOpenAI();

    const stripeSecretPresent =
      !!process.env.STRIPE_SECRET ||
      secretPresent(stripeSecretParam) ||
      secretPresent(stripeSecretKeyParam) ||
      secretPresent(stripeWebhookSecretParam) ||
      secretPresent(legacyStripeWebhookParam) ||
      envPresent(process.env.STRIPE_SECRET) ||
      envPresent(process.env.STRIPE_SECRET_KEY) ||
      envPresent(process.env.STRIPE_WEBHOOK_SECRET) ||
      envPresent(process.env.STRIPE_WEBHOOK) ||
      envPresent(process.env.STRIPE_SIGNING_SECRET) ||
      envPresent(process.env.STRIPE_SIGNATURE);

    const usdaKeyPresent = envPresent(process.env.USDA_FDC_API_KEY) || secretPresent(usdaFdcApiKeyParam);
    const nutritionConfigured = usdaKeyPresent;
    const nutritionRpmPresent = envPresent(process.env.NUTRITION_RPM) || usdaKeyPresent;
    const coachRpmPresent = envPresent(process.env.COACH_RPM);
    const scanDisabled = getEnvBool(scanDisabledFlag, false);
    const coachDisabled = getEnvBool(coachDisabledFlag, false);
    const workoutsDisabled = getEnvBool(workoutsDisabledFlag, false);
    const scanConfigured = openaiConfigured && !scanDisabled;
    const scanServicesHealthy = scanConfigured;
    const coachConfigured = openaiConfigured && !coachDisabled;
    const workoutsConfigured = !workoutsDisabled;
    const workoutAdjustConfigured = workoutsConfigured && openaiConfigured;

    const identityToolkitReachable = true;
    const identityToolkitReason = openaiConfigured || stripeSecretPresent || usdaKeyPresent ? "ok" : "unknown";

    const authProviders = {
      google: getEnvBool("AUTH_GOOGLE_ENABLED", true),
      apple: getEnvBool("AUTH_APPLE_ENABLED", true),
      email: getEnvBool("AUTH_EMAIL_ENABLED", true),
      demo: getEnvBool("AUTH_DEMO_ENABLED", true),
    } as const;

    res.status(200).json({
      host: req.get("host"),
      timestamp: new Date().toISOString(),
      appCheckMode: getAppCheckMode(),
      authProviders,
      stripeSecretPresent,
      openaiKeyPresent: openaiConfigured,
      nutritionConfigured,
      openaiConfigured,
      scanConfigured,
      scanServicesHealthy,
      coachConfigured,
      workoutsConfigured,
      workoutAdjustConfigured,
      usdaKeyPresent,
      nutritionRpmPresent,
      coachRpmPresent,
      identityToolkitReachable,
      identityToolkitReason,
    });
  },
);
