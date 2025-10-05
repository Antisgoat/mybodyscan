import type { Request, Response } from "express";
import { HttpsError } from "firebase-functions/v2/https";

import { readAppCheckOrigin, shouldStrictlyEnforceAppCheck } from "../appCheck.js";
import { getAppCheck } from "../firebase.js";

function getHeader(req: Request, key: string): string | undefined {
  return req.get(key) ?? req.get(key.toLowerCase()) ?? undefined;
}

export async function requireAppCheckStrict(req: Request, res: Response): Promise<void> {
  const token = getHeader(req, "X-Firebase-AppCheck");
  const origin = readAppCheckOrigin(req) ?? null;
  const strict = shouldStrictlyEnforceAppCheck(origin);
  if (!token) {
    const payload = { path: req.path, origin };
    if (strict) {
      console.warn("appcheck_strict_missing", payload);
      throw new HttpsError("unauthenticated", "Missing App Check token");
    }
    console.warn("appcheck_soft_missing", payload);
    return;
  }
  try {
    await getAppCheck().verifyToken(token);
  } catch (error) {
    const payload = { path: req.path, origin, message: (error as Error)?.message };
    if (strict) {
      console.warn("appcheck_strict_invalid", payload);
      throw new HttpsError("unauthenticated", "Invalid App Check token");
    }
    console.warn("appcheck_soft_invalid", payload);
    return;
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
