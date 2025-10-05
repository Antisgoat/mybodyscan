import type { Request, Response } from "express";
import { getAppCheck } from "../firebase.js";

function isSoftEnforce(): boolean {
  const raw = process.env.APP_CHECK_ENFORCE_SOFT;
  if (raw == null || raw === "") return true; // default soft
  return !/^false|0|no$/i.test(raw.trim());
}

function getHeader(req: Request, key: string): string | undefined {
  return req.get(key) ?? req.get(key.toLowerCase()) ?? undefined;
}

export async function requireAppCheckStrict(req: Request, res: Response): Promise<void> {
  const token = getHeader(req, "X-Firebase-AppCheck");
  const soft = isSoftEnforce();
  if (!token) {
    if (soft) {
      console.warn("appcheck_soft_missing", { path: req.path });
      return;
    }
    res.status(401).end();
    throw Object.assign(new Error("app_check_required"), { status: 401 });
  }
  try {
    await getAppCheck().verifyToken(token);
  } catch (error) {
    if (soft) {
      console.warn("appcheck_soft_invalid", { path: req.path, message: (error as Error)?.message });
      return;
    }
    res.status(401).end();
    throw Object.assign(new Error("invalid_app_check"), { status: 401 });
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
