import type { Request, Response, NextFunction } from "express";
import { getApp, initializeApp } from "firebase-admin/app";
import { appCheckSoft as httpAppCheckSoft } from "../http/appCheckSoft.js";

try {
  getApp();
} catch {
  initializeApp();
}

/** Soft App Check: never blocks; logs when header is missing/invalid. */
export async function appCheckSoft(req: Request, _res: Response, next: NextFunction) {
  try {
    await httpAppCheckSoft(req);
  } catch {
    // keep soft behavior even if verification helper throws
  }
  return next();
}
