import { getAppCheck } from "./firebase.js";

function isSoftEnforce(): boolean {
  const raw = process.env.APP_CHECK_ENFORCE_SOFT;
  if (raw == null || raw === "") return true; // default soft
  return !/^false|0|no$/i.test(raw.trim());
}

/** Throws 401-like error if missing/invalid App Check token when soft=false */
export async function verifyAppCheckFromHeader(req: any) {
  const token = req.header("X-Firebase-AppCheck");
  const soft = isSoftEnforce();
  if (!token) {
    if (soft) {
      console.warn("AppCheck: soft mode (missing)");
      return;
    }
    const err: any = new Error("app_check_required");
    err.status = 401;
    throw err;
  }
  try {
    await getAppCheck().verifyToken(token);
  } catch (error) {
    if (soft) {
      console.warn("AppCheck: soft mode (invalid)", { message: (error as Error)?.message });
      return;
    }
    const err: any = new Error("invalid_app_check");
    err.status = 401;
    throw err;
  }
}
