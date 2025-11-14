import { getAppCheck } from "firebase-admin/app-check";
import { logger } from "firebase-functions";

export async function appCheckSoft(req: any): Promise<void> {
  const token = String(req.header?.("X-Firebase-AppCheck") || req.headers?.["x-firebase-appcheck"] || "");
  if (!token) { logger.warn("appcheck_missing_soft"); return; }
  try {
    await getAppCheck().verifyToken(token);
  } catch (e: any) {
    logger.warn("appcheck_invalid_soft", { msg: e?.message });
  }
}
