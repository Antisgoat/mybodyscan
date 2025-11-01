import type { Request } from "express";
import { HttpsError } from "firebase-functions/v2/https";
import { getAppCheck, getAuth } from "./firebase.js";
import { getAppCheckMode, getHostBaseUrl, type AppCheckMode } from "./lib/env.js";

function getAuthHeader(req: Request): string | null {
  return req.get("authorization") || req.get("Authorization") || null;
}

export async function requireAuth(req: Request): Promise<string> {
  const header = getAuthHeader(req);
  if (!header) {
    console.warn("auth_missing_header", { path: req.path || req.url });
    throw new HttpsError("unauthenticated", "Authentication required");
  }
  const match = header.match(/^Bearer (.+)$/);
  if (!match) {
    console.warn("auth_invalid_format", { path: req.path || req.url });
    throw new HttpsError("unauthenticated", "Authentication required");
  }
  try {
    const decoded = await getAuth().verifyIdToken(match[1]);
    return decoded.uid;
  } catch (err) {
    console.warn("auth_invalid_token", { path: req.path || req.url, message: (err as any)?.message });
    throw new HttpsError("unauthenticated", "Invalid token");
  }
}

export async function requireAuthWithClaims(req: Request): Promise<{ uid: string; claims?: any }> {
  const header = getAuthHeader(req);
  if (!header) {
    console.warn("auth_missing_header", { path: req.path || req.url });
    throw new HttpsError("unauthenticated", "Authentication required");
  }
  const match = header.match(/^Bearer (.+)$/);
  if (!match) {
    console.warn("auth_invalid_format", { path: req.path || req.url });
    throw new HttpsError("unauthenticated", "Authentication required");
  }
  try {
    const decoded = await getAuth().verifyIdToken(match[1]);
    return { uid: decoded.uid, claims: decoded.claims };
  } catch (err) {
    console.warn("auth_invalid_token", { path: req.path || req.url, message: (err as any)?.message });
    throw new HttpsError("unauthenticated", "Invalid token");
  }
}

function readAppCheckToken(req: Request): string | null {
  const header = req.get("x-firebase-appcheck") || req.get("X-Firebase-AppCheck") || "";
  const trimmed = header.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function verifyToken(token: string): Promise<void> {
  await getAppCheck().verifyToken(token);
}

export async function verifyAppCheck(req: Request, mode: AppCheckMode = getAppCheckMode()): Promise<void> {
  if (mode === "disabled") {
    return;
  }

  const token = readAppCheckToken(req);
  if (!token) {
    if (mode === "soft") {
      console.warn("appcheck_missing", { path: req.path || req.url });
      return;
    }
    throw new HttpsError("unauthenticated", "app_check_required");
  }

  try {
    await verifyToken(token);
  } catch (err) {
    if (mode === "soft") {
      console.warn("appcheck_invalid", { path: req.path || req.url, message: (err as any)?.message });
      return;
    }
    console.warn("appcheck_invalid", { path: req.path || req.url, message: (err as any)?.message });
    throw new HttpsError("unauthenticated", "app_check_invalid");
  }
}

export async function verifyAppCheckStrict(req: Request): Promise<void> {
  const mode = getAppCheckMode();
  if (mode === "disabled" || mode === "soft") {
    await verifyAppCheck(req, mode);
    return;
  }
  await verifyAppCheck(req, "strict");
}

export async function verifyAppCheckSoft(req: Request): Promise<void> {
  await verifyAppCheck(req, "soft");
}

export function publicBaseUrl(req: { protocol?: string; get?: (header: string) => string | undefined }): string {
  const protocol = typeof req?.protocol === "string" && req.protocol.length > 0 ? req.protocol : "https";
  const host = typeof req?.get === "function" ? req.get("host") : undefined;
  const fallback = host ? `${protocol}://${host}` : "https://mybodyscanapp.com";
  return getHostBaseUrl() || fallback;
}
