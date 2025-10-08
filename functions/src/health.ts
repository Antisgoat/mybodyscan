import { onRequest } from "firebase-functions/v2/https";

import { withCors } from "./middleware/cors.js";
import { getAppCheckEnforceSoft } from "./lib/env.js";

type ScanProvider = "openai-vision" | "mock";

type HealthPayload = {
  status: "ok";
  time: string;
  hasOpenAIKey: boolean;
  appCheckSoft: boolean;
  scanProvider: ScanProvider;
  nutritionConfigured: boolean;
  coachDocPath: "users/{uid}/coach/plan";
  demoCreditsPolicy: ">=2 on demo";
};

function hasValue(value: string | undefined | null): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export const health = onRequest(
  { invoker: "public" },
  withCors(async (_req, res) => {
    const now = new Date().toISOString();

    const hasOpenAIKey = hasValue(process.env.OPENAI_API_KEY);
    const nutritionConfigured = hasValue(process.env.USDA_FDC_API_KEY);
    const scanProvider: ScanProvider = hasOpenAIKey ? "openai-vision" : "mock";

    const appCheckSoft = getAppCheckEnforceSoft();

    const payload: HealthPayload = {
      status: "ok",
      time: now,
      hasOpenAIKey,
      appCheckSoft,
      scanProvider,
      nutritionConfigured,
      coachDocPath: "users/{uid}/coach/plan",
      demoCreditsPolicy: ">=2 on demo",
    };

    res.json(payload);
  }),
);
