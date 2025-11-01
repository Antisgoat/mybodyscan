import type { NextFunction, Request, Response } from "express";

export function appCheckSoft(req: Request, _res: Response, next: NextFunction): void {
  const header = req.get("X-Firebase-AppCheck") || req.get("x-firebase-appcheck") || "";
  const appCheckPresent = header.trim().length > 0;

  if (!appCheckPresent) {
    console.warn("? appcheck_missing", { path: req.path || req.url || "", appCheckPresent });
  }

  next();
}
