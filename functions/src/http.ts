import type { Request } from "express";
import { HttpsError } from "firebase-functions/v2/https";
import { getAppCheck, getAuth } from "./firebase.js";
import { getHostBaseUrl } from "./lib/env.js";

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
    // Attach decoded token to request for later access to claims
    (req as any).decodedToken = decoded;
    return decoded.uid;
  } catch (err) {
    console.warn("auth_invalid_token", { path: req.path || req.url, message: (err as any)?.message });
    throw new HttpsError("unauthenticated", "Invalid token");
  }
}

export async function verifyAppCheckStrict(req: Request): Promise<void> {
  const token = req.get("x-firebase-appcheck") || req.get("X-Firebase-AppCheck") || "";
  if (!token) {
    console.warn("appcheck_missing", { path: req.path || req.url });
    throw new HttpsError("failed-precondition", "App Check token required");
  }
  try {
    await getAppCheck().verifyToken(token);
  } catch (err) {
    console.warn("appcheck_invalid", { path: req.path || req.url, message: (err as any)?.message });
    throw new HttpsError("failed-precondition", "Invalid App Check token");
  }
}

export async function verifyAppCheckSoft(req: Request): Promise<void> {
  const token = req.get("x-firebase-appcheck") || req.get("X-Firebase-AppCheck") || "";
  if (!token) return;
  try {
    await getAppCheck().verifyToken(token);
  } catch (err) {
    // ignore soft failures to keep compatibility endpoints usable
  }
}

export function publicBaseUrl(req: { protocol?: string; get?: (header: string) => string | undefined }): string {
  const protocol = typeof req?.protocol === "string" && req.protocol.length > 0 ? req.protocol : "https";
  const host = typeof req?.get === "function" ? req.get("host") : undefined;
  const fallback = host ? `${protocol}://${host}` : "https://mybodyscanapp.com";
  return getHostBaseUrl() || fallback;
}
