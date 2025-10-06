import { onRequest } from "firebase-functions/v2/https";

import { readAppCheckOrigin, shouldStrictlyEnforceAppCheck } from "./appCheck.js";
import { softAppCheck } from "./middleware/appCheck.js";
import { withCors } from "./middleware/cors.js";

function hasValue(value: string | undefined | null): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export const health = onRequest(
  { region: "us-central1", invoker: "public" },
  withCors(async (req, res) => {
    // Verify any provided App Check token but do not require one.
    try {
      await softAppCheck(req as any);
    } catch (error) {
      console.warn("health_appcheck_soft_error", { message: (error as Error)?.message });
    }

    const origin = readAppCheckOrigin(req) ?? null;
    const strict = shouldStrictlyEnforceAppCheck(origin);
    const hasOpenAIKey = hasValue(process.env.OPENAI_API_KEY);
    const hasUsdaKey = hasValue(process.env.USDA_FDC_API_KEY);
    const fallbackNutritionAvailable = true;
    const nutritionCallable = hasUsdaKey || fallbackNutritionAvailable;

    res.status(200).json({
      status: "ok",
      time: new Date().toISOString(),
      hasOpenAIKey,
      appCheckSoft: !strict,
      nutritionCallable,
      coachDocPath: "users/{uid}/coach/plan",
      scanProvider: hasOpenAIKey ? "openai-vision" : "mock",
      demoCreditsPolicy: ">=2 on demo init",
    });
  })
);
