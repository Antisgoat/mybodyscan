import type { Request, Response } from "express";
import { getAppCheck } from "../firebase.js";

function getHeader(req: Request, key: string): string | undefined {
  return req.get(key) ?? req.get(key.toLowerCase()) ?? undefined;
}

export async function requireAppCheckStrict(req: Request, res: Response): Promise<void> {
  const token = getHeader(req, "X-Firebase-AppCheck");
  if (!token) {
    // Soft enforce for now: allow request but log. Flip to strict later.
    console.warn("appcheck_soft_missing", { path: req.path });
    return;
  }
  try {
    await getAppCheck().verifyToken(token);
  } catch (error) {
    // Soft mode: log and continue
    console.warn("appcheck_soft_invalid", { path: req.path, message: (error as Error)?.message });
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
