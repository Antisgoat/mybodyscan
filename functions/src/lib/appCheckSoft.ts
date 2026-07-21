import { randomUUID } from "node:crypto";
import type { Request } from "express";
import type { CallableRequest } from "firebase-functions/v2/https";
import { HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { getAppCheck } from "../firebase.js";
import { getAppCheckMode } from "./env.js";

type SoftAppCheckContext = {
  fn: string;
  uid?: string | null;
  requestId?: string | null;
  source?: "callable" | "http";
};

function buildContext(ctx: SoftAppCheckContext) {
  return {
    fn: ctx.fn,
    uid: ctx.uid ?? null,
    requestId: ctx.requestId ?? randomUUID(),
    source: ctx.source ?? "http",
  };
}

async function verifyToken(token: string, ctx: SoftAppCheckContext) {
  try {
    await getAppCheck().verifyToken(token);
    return true;
  } catch (error: any) {
    logger.warn("appcheck.soft.invalid", {
      ...buildContext(ctx),
      message: error?.message,
    });
    return false;
  }
}

function rejectIfStrict(valid: boolean): void {
  if (!valid && getAppCheckMode() === "strict") {
    throw new HttpsError("permission-denied", "Valid App Check token required");
  }
}

export async function ensureSoftAppCheckFromCallable(
  request: CallableRequest<any>,
  ctx: SoftAppCheckContext
): Promise<void> {
  if (getAppCheckMode() === "disabled") return;
  const requestAny = request as CallableRequest<any> & {
    appCheck?: { token?: string };
  };
  const token = (
    requestAny.appCheck?.token ||
    request.rawRequest?.get?.("x-firebase-appcheck") ||
    ""
  ).trim();
  const context = { ...ctx, source: "callable" as const };
  if (!token) {
    logger.warn("appcheck.soft.missing", buildContext(context));
    rejectIfStrict(false);
    return;
  }
  rejectIfStrict(await verifyToken(token, context));
}

export async function ensureSoftAppCheckFromRequest(
  req: Request,
  ctx: SoftAppCheckContext
): Promise<void> {
  if (getAppCheckMode() === "disabled") return;
  const token = (
    req.get("x-firebase-appcheck") ||
    req.get("X-Firebase-AppCheck") ||
    ""
  ).trim();
  const context = { ...ctx, source: "http" as const };
  if (!token) {
    logger.warn("appcheck.soft.missing", buildContext(context));
    rejectIfStrict(false);
    return;
  }
  rejectIfStrict(await verifyToken(token, context));
}
