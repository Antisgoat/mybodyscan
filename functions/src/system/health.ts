import { getHostBaseUrl, getAppCheckEnforceSoft, hasOpenAI, hasStripe } from "../lib/env.js";
import type { Request, Response } from "express";
import { onRequest } from "firebase-functions/v2/https";

export function systemHealth(_req: Request, res: Response) {
  const openAiAvailable = hasOpenAI();
  const model = openAiAvailable ? process.env.OPENAI_MODEL || "gpt-4o-mini" : null;
  const host = getHostBaseUrl() || process.env.GCLOUD_PROJECT || null;
  const stripeConfigured = hasStripe();

  const payload = {
    hasOpenAI: openAiAvailable,
    model,
    hasStripe: stripeConfigured,
    appCheckSoft: getAppCheckEnforceSoft(),
    host,
  } as const;

  res.status(stripeConfigured ? 200 : 501).json(payload);
}

// Export a Cloud Function compatible with Hosting rewrite "system/health" -> functionId "system"
export const system = onRequest({ region: "us-central1" }, async (req, res) => {
  await systemHealth(req as unknown as Request, res as unknown as Response);
});
