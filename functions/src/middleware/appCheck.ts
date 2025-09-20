import type { NextFunction, Request, Response } from "express";
import { getAppCheck } from "../firebase";

export async function softVerifyAppCheck(
  req: Request,
  _res: Response,
  next?: NextFunction
): Promise<void> {
  const header =
    req.get("X-Firebase-AppCheck") || req.get("x-firebase-appcheck") || "";
  let verified = false;

  if (!header) {
    console.info("softVerifyAppCheck: missing App Check token");
  } else {
    try {
      await getAppCheck().verifyToken(header);
      verified = true;
    } catch (err) {
      console.warn("softVerifyAppCheck: invalid token", err);
    }
  }

  (req as any).appCheckVerified = verified;

  if (next) {
    next();
  }
}
