import type { Request, Response } from "express";
import { getAppCheck } from "../firebase.js";

function getHeader(req: Request, key: string): string | undefined {
  return req.get(key) ?? req.get(key.toLowerCase()) ?? undefined;
}

export async function requireAppCheckStrict(req: Request, res: Response): Promise<void> {
  const token = getHeader(req, "X-Firebase-AppCheck");
  if (!token) {
    res.status(401).json({ ok: false, reason: "missing_appcheck" });
    throw new Error("missing_appcheck");
  }
  try {
    await getAppCheck().verifyToken(token);
  } catch (error) {
    res.status(401).json({ ok: false, reason: "invalid_appcheck" });
    throw error;
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
