import { getHostBaseUrl, getAppCheckEnforceSoft, hasOpenAI, hasStripe } from "../lib/env.js";
import type { Request, Response } from "express";

export function systemHealth(_req: Request, res: Response) {
  res.json({
    hasOpenAI: hasOpenAI(),
    model: hasOpenAI() ? "gpt-4o-mini" : null,
    hasStripe: hasStripe(),
    appCheckSoft: getAppCheckEnforceSoft(),
    host: getHostBaseUrl() || null,
  });
}
