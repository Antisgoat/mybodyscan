import { onRequest } from "firebase-functions/v2/https";
import { getEnv, getEnvBool } from "./lib/env.js";

export const systemHealth = onRequest({ region: "us-central1" }, async (req, res) => {
  try {
    const hasOpenAI = Boolean(getEnv("OPENAI_API_KEY"));
    const model = hasOpenAI ? "openai-vision" : null;
    const hasStripe = Boolean((getEnv("STRIPE_SECRET") || getEnv("STRIPE_SECRET_KEY")));
    const appCheckSoft = getEnvBool("APP_CHECK_ENFORCE_SOFT", true);
    const host = getEnv("HOST_BASE_URL") || "";
    res.status(200).json({ hasOpenAI, model, hasStripe, appCheckSoft, host });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || "internal" });
  }
});
