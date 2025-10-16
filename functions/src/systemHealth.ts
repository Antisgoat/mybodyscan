import { onRequest as onRequestV2 } from "firebase-functions/v2/https";
import { getEnv } from "./lib/env.js";

export const systemHealth = onRequestV2({ cors: true }, (req, res) => {
  const host = req.get("host") ?? "";
  const versions = {
    node: process.version,
    functions: process.env.FUNCTIONS_EMULATOR ? "emulator" : "production",
  };
  
  res.status(200).json({
    ok: true,
    versions,
    hasOpenAI: Boolean(process.env.OPENAI_API_KEY),
    hasStripe: Boolean(
      process.env.STRIPE_SECRET_KEY ||
        process.env.STRIPE_SECRET ||
        process.env.STRIPE_API_KEY
    ),
    hasUSDA: Boolean(process.env.USDA_API_KEY || process.env.USDA_FDC_API_KEY),
    appCheckSoft: true,
    host,
    hostBaseUrl: host ? `https://${host}` : "",
    model: process.env.OPENAI_MODEL ?? null,
    timestamp: new Date().toISOString(),
  });
});
