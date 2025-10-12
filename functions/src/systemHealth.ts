import { onRequest } from "firebase-functions/v2/https";
import { getEnv, getEnvBool, hasOpenAI, hasStripe } from "./lib/env.js";

export const systemHealth = onRequest({ region: "us-central1" }, async (req, res) => {
  try {
    const host = req.headers.host ?? "";
    const openAIExists = hasOpenAI();
    const model = openAIExists ? "openai-vision" : null;
    const stripeExists = hasStripe();
    const appCheckSoft = getEnvBool("APP_CHECK_ENFORCE_SOFT", true);
    const hostBaseUrl = getEnv("HOST_BASE_URL") || "";
    
    res.status(200).json({
      hasOpenAI: openAIExists,
      model,
      hasStripe: stripeExists,
      appCheckSoft,
      host,
      hostBaseUrl
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || "internal" });
  }
});
