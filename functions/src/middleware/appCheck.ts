import type { Request, Response, NextFunction } from "express";
import { HttpsError } from "firebase-functions/v2/https";

import { readAppCheckOrigin } from "../appCheck.js";
import { getAppCheck } from "../firebase.js";
import { getAllowedOrigins, getAppCheckEnforceSoft } from "../lib/env.js";

function getHeader(req: Request, key: string): string | undefined {
  return req.get(key) ?? req.get(key.toLowerCase()) ?? undefined;
}

function isOriginAllowed(origin: string | undefined, allowedOrigins: string[]): boolean {
  if (!allowedOrigins.length) {
    return true;
  }
  if (!origin) {
    return false;
  }
  return allowedOrigins.includes(origin);
}

export async function requireAppCheckStrict(req: Request, res: Response): Promise<void> {
  const token = getHeader(req, "X-Firebase-AppCheck");
  const origin = readAppCheckOrigin(req) ?? null;
  if (!token) {
    console.warn("appcheck_strict_missing", { path: req.path, origin });
    throw new HttpsError("permission-denied", "Missing App Check token");
  }
  try {
    await getAppCheck().verifyToken(token);
  } catch (error) {
    console.warn("appcheck_strict_invalid", {
      path: req.path,
      origin,
      message: (error as Error)?.message,
    });
    throw new HttpsError("permission-denied", "Invalid App Check token");
  }
}

export async function softAppCheck(req: Request): Promise<boolean> {
  const token = getHeader(req, "X-Firebase-AppCheck");
  if (!token) {
    return false;
  }
  try {
    await getAppCheck().verifyToken(token);
    return true;
  } catch (error) {
    console.warn("appcheck_soft_invalid", { message: (error as Error)?.message });
    return false;
  }
}

function logSoft(mode: "missing" | "invalid", context: Record<string, unknown>) {
  console.warn(`appcheck_soft_${mode}`, context);
}

export function appCheckSoft(req: Request, res: Response, next: NextFunction): void {
  const allowedOrigins = getAllowedOrigins() ?? [];
  const origin = readAppCheckOrigin(req);
  const softEnforced = getAppCheckEnforceSoft();
  const originAllowed = isOriginAllowed(origin, allowedOrigins);
  const token = getHeader(req, "X-Firebase-AppCheck");

  if (!token) {
    if (softEnforced || !originAllowed) {
      logSoft("missing", { path: req.path, origin, originAllowed, mode: "soft" });
      next();
      return;
    }
    res.status(403).json({ error: "app_check_required" });
    return;
  }

  getAppCheck()
    .verifyToken(token)
    .then(() => {
      next();
    })
    .catch((error: any) => {
      const payload = {
        path: req.path,
        origin,
        message: error instanceof Error ? error.message : String(error),
      };
      if (softEnforced || !originAllowed) {
        logSoft("invalid", { ...payload, originAllowed, mode: "soft" });
        next();
        return;
      }
      console.warn("appcheck_strict_invalid", payload);
      if (!res.headersSent) {
        res.status(403).json({ error: "app_check_required" });
      }
    });
}
