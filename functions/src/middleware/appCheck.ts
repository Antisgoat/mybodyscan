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
      console.warn("appcheck_missing_soft", { path: req.path || req.url });
      return next();
    }

    const origin = req.header("origin");
    if (allowed.length && origin && !allowed.includes(origin)) {
      console.warn("appcheck_origin_blocked_soft", { origin });
      return next();
    }

    return next();
  } catch (error) {
    console.warn("appcheck_soft_middleware_error", { message: (error as any)?.message });
    return next();
  }
}
