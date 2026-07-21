import type { Request, Response, NextFunction } from "express";
import { getApp, initializeApp } from "firebase-admin/app";
import { appCheckSoft as httpAppCheckSoft } from "../http/appCheckSoft.js";

try {
  getApp();
} catch {
  initializeApp();
}

/** Soft App Check: never blocks; logs when header is missing/invalid. */
export async function appCheckSoft(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    await httpAppCheckSoft(req);
  } catch {
    res.status(403).json({ error: "app_check_required" });
    return;
  }
  return next();
}
