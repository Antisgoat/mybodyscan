import { getHostBaseUrl, getAppCheckEnforceSoft, hasOpenAI, hasStripe } from "../lib/env.js";
import type { Request, Response } from "express";
import { onRequest } from "firebase-functions/v2/https";

export function systemHealth(_req: Request, res: Response) {
  res.json({
    hasOpenAI: hasOpenAI(),
    model: hasOpenAI() ? "gpt-4o-mini" : null,
    hasStripe: hasStripe(),
    appCheckSoft: getAppCheckEnforceSoft(),
    host: getHostBaseUrl() || null,
  });
}

// Export a Cloud Function compatible with Hosting rewrite "system/health" -> functionId "system"
export const system = onRequest({ region: "us-central1" }, async (req, res) => {
  await systemHealth(req as unknown as Request, res as unknown as Response);
});
