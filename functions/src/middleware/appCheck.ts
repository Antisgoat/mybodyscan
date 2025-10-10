import type { Request, Response, NextFunction } from "express";
import { getAllowedOrigins, getAppCheckEnforceSoft } from "../lib/env.js";

export function appCheckSoft(req: Request, res: Response, next: NextFunction) {
  try {
    if (getAppCheckEnforceSoft()) return next();
    const token = req.header("X-Firebase-AppCheck") || req.header("x-firebase-appcheck");
    if (!token) return res.status(403).json({ error: "app_check_required" });

    const allowed = getAllowedOrigins();
    if (allowed.length) {
      const origin = req.header("origin");
      if (origin && !allowed.includes(origin)) {
        return res.status(403).json({ error: "origin_not_allowed" });
      }
    }
    return next();
  } catch {
    return next();
  }
}
