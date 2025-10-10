import type { Request, Response } from "express";
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
