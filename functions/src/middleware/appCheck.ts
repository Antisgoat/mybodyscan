import type { Request, Response } from "express";
import { HttpsError } from "firebase-functions/v2/https";
import { getAppCheck } from "../firebase.js";

const softEnforce = (process.env.APPCHECK_SOFT_ENFORCE ?? "true").toLowerCase() !== "false";

function endpointFrom(req: Request): string {
  return req.path || req.url || "unknown";
}

function logViolation(reason: string, req: Request, error?: unknown): void {
  const uid = (req as any)?.authUid ?? null;
  const context: Record<string, unknown> = {
    reason,
    endpoint: endpointFrom(req),
    uid,
  };
  if (error instanceof Error) {
    context.message = error.message;
  }
  console.warn("appcheck_violation", context);
}

function getHeader(req: Request, key: string): string | undefined {
  return req.get(key) ?? req.get(key.toLowerCase()) ?? undefined;
}

export async function requireAppCheckStrict(req: Request, _res: Response): Promise<void> {
  const token = getHeader(req, "X-Firebase-AppCheck");
  if (!token) {
    logViolation("missing", req);
    if (softEnforce) {
      return;
    }
    throw new HttpsError("failed-precondition", "app_check_required");
  }
  try {
    await getAppCheck().verifyToken(token);
  } catch (error) {
    logViolation("invalid", req, error);
    if (softEnforce) {
      return;
    }
    throw new HttpsError("failed-precondition", "app_check_invalid");
  }
}

export async function softAppCheck(req: Request): Promise<boolean> {
  const token = getHeader(req, "X-Firebase-AppCheck");
  if (!token) {
    return false;
  }
  try {
    await getAppCheck().verifyToken(token);
    return true;
  } catch (error) {
    logViolation("soft_invalid", req, error);
    return false;
  }
}
