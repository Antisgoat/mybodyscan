import type { Request, Response, NextFunction } from "express";
import { getAllowedOrigins, getAppCheckMode } from "../lib/env.js";

// Null-safe App Check middleware supporting soft/strict/disabled modes.
export function appCheckSoft(req: Request, res: Response, next: NextFunction) {
  try {
    const mode = getAppCheckMode();
    if (mode === "disabled") {
      return next();
    }

    const allowed = (() => {
      try {
        return getAllowedOrigins();
      } catch {
        return [] as string[];
      }
    })();

    const token = req.header("X-Firebase-AppCheck") || req.header("x-firebase-appcheck") || "";
    if (!token.trim()) {
      if (mode === "soft") {
        console.warn("appcheck_missing", { path: req.path || req.url });
        return next();
      }
      return res.status(401).json({ error: "app_check_required" });
    }

    const origin = req.header("origin");
    if (allowed.length && origin && !allowed.includes(origin)) {
      return res.status(403).json({ error: "origin_not_allowed" });
    }

    return next();
  } catch {
    // Never crash; continue to next middleware to keep soft behavior truly soft
    return next();
  }
}
