import { onRequest as onRequestV2 } from "firebase-functions/v2/https";
import { getEnv, getEnvBool, getHostBaseUrl } from "./lib/env.js";
import { getAppCheckEnforceSoft } from "./lib/env.js";

export const systemHealth = onRequestV2({ cors: true }, (req, res) => {
  const host = req.get("host") ?? "";
  const appCheckSoft = getAppCheckEnforceSoft();
  res.status(200).json({
    ok: true,
    versions: {
      functions: getEnv("K_REVISION") || null,
      node: process.version,
    },
    hasOpenAI: Boolean(getEnv("OPENAI_API_KEY")),
    hasStripe: Boolean(getEnv("STRIPE_SECRET_KEY") || getEnv("STRIPE_SECRET") || getEnv("STRIPE_API_KEY")),
    appCheckSoft,
    host,
    hostBaseUrl: getHostBaseUrl() || (host ? `https://${host}` : ""),
  });
});
