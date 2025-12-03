import { randomUUID } from "node:crypto";
import type { Request } from "express";
import type { CallableRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { getAppCheck } from "../firebase.js";

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

export async function ensureSoftAppCheckFromCallable(
  request: CallableRequest<any>,
  ctx: SoftAppCheckContext,
): Promise<void> {
  const token = (request.appCheck?.token || request.rawRequest?.get?.("x-firebase-appcheck") || "").trim();
  const context = { ...ctx, source: "callable" as const };
  if (!token) {
    logger.warn("appcheck.soft.missing", buildContext(context));
    return;
  }
  await verifyToken(token, context);
}

export async function ensureSoftAppCheckFromRequest(req: Request, ctx: SoftAppCheckContext): Promise<void> {
  const token = (req.get("x-firebase-appcheck") || req.get("X-Firebase-AppCheck") || "").trim();
  const context = { ...ctx, source: "http" as const };
  if (!token) {
    logger.warn("appcheck.soft.missing", buildContext(context));
    return;
  }
  await verifyToken(token, context);
}
