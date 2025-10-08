import type { Request, Response, NextFunction } from "express";
import { getAllowedOrigins, getAppCheckEnforceSoft } from "../lib/env.js";

export function appCheckSoft(req: Request, res: Response, next: NextFunction) {
  try {
    // Soft mode never blocks
    if (getAppCheckEnforceSoft()) return next();

    // Strict mode: require header, (origin check optional)
    const token = req.header("X-Firebase-AppCheck") || req.header("x-firebase-appcheck");
    if (!token) return res.status(403).json({ error: "app_check_required" });

    // Optional origin awareness (no .length on undefined)
    const origins = getAllowedOrigins(); // [] when unset
    if (origins.length > 0) {
      const origin = req.header("origin");
      if (origin && !origins.includes(origin)) {
        return res.status(403).json({ error: "origin_not_allowed" });
      }
    }
    return next();
  } catch {
    // Never crash requests because of middleware
    return next();
  }
}
