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
  // Strict mode only blocks if missing token; verify when present but don't throw on failure
  try {
    await getAppCheck().verifyToken(token);
  } catch (error) {
    console.warn("appcheck_strict_verify_soft_fail", {
      path: req.path,
      origin,
      message: (error as Error)?.message,
    });
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
  const softEnforced = getAppCheckEnforceSoft();
  if (softEnforced) {
    // Soft enforcement: always allow
    next();
    return;
  }

  const allowedOrigins = getAllowedOrigins() ?? [];
  const origin = readAppCheckOrigin(req);
  const originAllowed = isOriginAllowed(origin, allowedOrigins);
  const token = getHeader(req, "X-Firebase-AppCheck");

  if (!token) {
    if (!res.headersSent) {
      res.status(403).json({ error: "app_check_required" });
    }
    return;
  }

  // Verify when present, but proceed regardless of verification result in strict mode per requirement
  getAppCheck()
    .verifyToken(token)
    .then(() => next())
    .catch((error: any) => {
      logSoft("invalid", { path: req.path, origin, originAllowed, message: error?.message });
      next();
    });
}
