import type { Request, Response } from "express";
import { onRequest } from "firebase-functions/v2/https";
import { hasOpenAI, hasStripe, getAppCheckEnforceSoft, getHostBaseUrl } from "../lib/env.js";

export function systemHealth(_req: Request, res: Response) {
  res.json({
    hasOpenAI: hasOpenAI(),
    model: hasOpenAI() ? "gpt-4o-mini" : null,
    hasStripe: hasStripe(),
    appCheckSoft: getAppCheckEnforceSoft(),
    host: getHostBaseUrl() || null,
  });
}

// Keep Cloud Function for Hosting rewrite compatibility
export const system = onRequest({ region: "us-central1" }, async (req, res) => {
  await systemHealth(req as unknown as Request, res as unknown as Response);
});
