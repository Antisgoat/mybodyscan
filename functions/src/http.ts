import type { Request } from "firebase-functions/v2/https";
import { HttpsError } from "firebase-functions/v2/https";
import { getAppCheck, getAuth } from "./firebase";

function getAuthHeader(req: Request): string | null {
  return req.get("authorization") || req.get("Authorization") || null;
}

export async function requireAuth(req: Request): Promise<string> {
  const header = getAuthHeader(req);
  if (!header) {
    throw new HttpsError("unauthenticated", "Authentication required");
  }
  const match = header.match(/^Bearer (.+)$/);
  if (!match) {
    throw new HttpsError("unauthenticated", "Authentication required");
  }
  try {
    const decoded = await getAuth().verifyIdToken(match[1]);
    return decoded.uid;
  } catch (err) {
    throw new HttpsError("unauthenticated", "Invalid token");
  }
}

export async function verifyAppCheckStrict(req: Request): Promise<void> {
  const token = req.get("x-firebase-appcheck") || req.get("X-Firebase-AppCheck") || "";
  if (!token) {
    throw new HttpsError("failed-precondition", "App Check token required");
  }
  try {
    await getAppCheck().verifyToken(token);
  } catch (err) {
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
