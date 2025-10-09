import { getHostBaseUrl, getAppCheckEnforceSoft, hasOpenAI, hasStripe } from "../lib/env.js";
import type { Request, Response } from "express";

const OPENAI_MODEL = "gpt-4o-mini";

export function systemHealth(_req: Request, res: Response) {
  const openAiAvailable = hasOpenAI();
  res.json({
    hasOpenAI: openAiAvailable,
    model: openAiAvailable ? OPENAI_MODEL : null,
    hasStripe: hasStripe(),
    appCheckSoft: getAppCheckEnforceSoft(),
    host: getHostBaseUrl() || null,
  });
}
