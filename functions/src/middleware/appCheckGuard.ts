import type { Request, Response } from "express";
import { HttpsError } from "firebase-functions/v2/https";
import { appCheckSoft } from "./appCheck.js";

async function runAppCheck(req: Request, res: Response): Promise<boolean> {
  let allowed = false;
  await new Promise<void>((resolve) => {
    let settled = false;
    const emitter: any = res;
    const cleanup = () => {
      if (settled) return;
      settled = true;
      emitter.off?.("finish", cleanup as any);
      emitter.off?.("close", cleanup as any);
      resolve();
    };
    emitter.once?.("finish", cleanup as any);
    emitter.once?.("close", cleanup as any);
    try {
      appCheckSoft(req, res, () => {
        allowed = true;
        cleanup();
      });
    } catch {
      cleanup();
    }
    if (res.headersSent) {
      cleanup();
    }
  });
  return allowed && !res.headersSent;
}

export async function ensureAppCheck(req: Request, res: Response): Promise<void> {
  const ok = await runAppCheck(req, res);
  if (!ok) {
    throw new HttpsError("permission-denied", "app_check_required");
  }
}

export async function maybeAppCheck(req: Request, res: Response): Promise<boolean> {
  return runAppCheck(req, res);
}
