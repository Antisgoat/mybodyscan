import { logger } from "firebase-functions";
import { getAppCheck } from "firebase-admin/app-check";

export async function appCheckSoft(req: any): Promise<void> {
  const token = String(
    req.get?.("X-Firebase-AppCheck") ||
      req.headers?.["x-firebase-app-check"] ||
      ""
  );
  if (!token) {
    logger.warn("appcheck_missing_soft");
    return;
  }
  try {
    await getAppCheck().verifyToken(token);
  } catch (e: any) {
    logger.warn("appcheck_invalid_soft", { err: e?.message });
  }
}
