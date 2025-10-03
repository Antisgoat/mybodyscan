import * as admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp();
}

/** Throws 401-like error if missing/invalid App Check token */
export async function verifyAppCheckFromHeader(req: any) {
  const token = req.header("X-Firebase-AppCheck");
  if (!token) {
    const error: any = new Error("missing app check");
    error.status = 401;
    throw error;
  }
  try {
    await admin.appCheck().verifyToken(token);
  } catch {
    const error: any = new Error("invalid app check");
    error.status = 401;
    throw error;
  }
}
