import { logger } from "firebase-functions";
import { getAppCheck } from "firebase-admin/app-check";
export async function appCheckSoft(req: any): Promise<void> {
  const t = String(req.get?.("X-Firebase-AppCheck") || req.headers?.["x-firebase-app-check"] || "");
  if (!t) { logger.warn("appcheck_missing"); return; }
  try { await getAppCheck().verifyToken(t); } catch (e: any) { logger.warn("appcheck_invalid", { err: e?.message }); }
}
