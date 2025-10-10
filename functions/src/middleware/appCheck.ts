import type { Request, Response, NextFunction } from "express";
import { getAllowedOrigins, getAppCheckEnforceSoft } from "../lib/env.js";

// Null-safe App Check soft middleware: allow when soft=true; enforce token when strict.
export function appCheckSoft(req: Request, res: Response, next: NextFunction) {
  try {
    const soft = getAppCheckEnforceSoft();
    const allowed = (() => {
      try {
        return getAllowedOrigins();
      } catch {
        return [] as string[];
      }
    })();

    if (!soft) {
      const token = req.header("X-Firebase-AppCheck") || req.header("x-firebase-appcheck");
      if (!token) return res.status(403).json({ error: "app_check_required" });
      const origin = req.header("origin");
      if (allowed.length && origin && !allowed.includes(origin)) {
        return res.status(403).json({ error: "origin_not_allowed" });
      }
    }
    return next();
  } catch {
    // Never crash; continue to next middleware to keep soft behavior truly soft
    return next();
  }
}
