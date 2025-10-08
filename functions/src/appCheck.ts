import * as admin from "firebase-admin";
import { HttpsError } from "firebase-functions/v2/https";

import { getAppCheckAllowedOrigins, isAppCheckSoftEnforced } from "./env.js";

if (!admin.apps.length) {
  admin.initializeApp();
}

const allowedOriginsRaw = getAppCheckAllowedOrigins();
const allowedOrigins = new Set(allowedOriginsRaw);

const softEnforcement = isAppCheckSoftEnforced();

function shouldEnforceStrict(origin?: string | null): boolean {
  if (softEnforcement) {
    return false;
  }
  if (!allowedOrigins.size) {
    return true;
  }
  if (!origin) {
    return false;
  }
  return allowedOrigins.has(origin);
}

export function readAppCheckOrigin(req: any): string | undefined {
  if (!req?.get) {
    return undefined;
  }
  return req.get("Origin") ?? req.get("origin") ?? undefined;
}

export function shouldStrictlyEnforceAppCheck(origin?: string | null): boolean {
  return shouldEnforceStrict(origin ?? null);
}

/** Throws 401-like error if missing/invalid App Check token */
export async function verifyAppCheckFromHeader(req: any) {
  const token = req?.header ? req.header("X-Firebase-AppCheck") : undefined;
  const origin = readAppCheckOrigin(req) ?? null;
  const path = typeof req?.path === "string" ? req.path : null;
  const strict = shouldStrictlyEnforceAppCheck(origin);

  if (!token) {
    const payload = { origin, path };
    if (strict) {
      console.warn("AppCheck: strict reject (missing)", payload);
      throw new HttpsError("permission-denied", "Missing App Check token");
    }
    console.warn("AppCheck: soft mode (missing)", payload);
    return;
  }

  try {
    await admin.appCheck().verifyToken(token);
  } catch (error) {
    const payload = { origin, path, message: (error as Error)?.message };
    if (strict) {
      console.warn("AppCheck: strict reject (invalid)", payload);
      throw new HttpsError("permission-denied", "Invalid App Check token");
    }
    console.warn("AppCheck: soft mode (invalid)", payload);
  }
}
