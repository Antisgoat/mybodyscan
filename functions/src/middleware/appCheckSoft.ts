import type { Request, Response, NextFunction } from "express";
import { getApp, initializeApp } from "firebase-admin/app";

try {
  getApp();
} catch {
  initializeApp();
}

/** Soft App Check: never blocks; logs when header is missing/invalid. */
export async function appCheckSoft(req: Request, _res: Response, next: NextFunction) {
  const hdr = req.header("X-Firebase-AppCheck") || req.header("x-firebase-appcheck");
  if (!hdr) {
    console.warn("appcheck_missing", { path: req.path });
    return next();
  }
  try {
    // Lazy import to avoid hard dependency in cold starts
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getAppCheck } = require("firebase-admin/app-check");
    await getAppCheck().verifyToken(hdr);
    return next();
  } catch (e) {
    console.warn("appcheck_invalid", { path: req.path, reason: (e as Error)?.message });
    return next();
  }
}
