import type { Request, Response } from "express";
import { onRequest } from "firebase-functions/v2/https";

import {
  getAppCheckEnforceSoft,
  getHostBaseUrl,
  hasOpenAI,
  hasStripe,
} from "../lib/env.js";
import { withCors } from "../middleware/cors.js";

export const systemHealth = (_req: Request, res: Response) => {
  res.json({
    hasOpenAI: hasOpenAI(),
    hasStripe: hasStripe(),
    appCheckSoft: getAppCheckEnforceSoft(),
    host: getHostBaseUrl() || undefined,
  });
};

export const systemHealthFunction = onRequest(
  { region: "us-central1", invoker: "public" },
  withCors((req, res) => {
    systemHealth(req as unknown as Request, res as unknown as Response);
  })
);
