import { logger } from "firebase-functions";
import { getAppCheck } from "firebase-admin/app-check";
import { HttpsError } from "firebase-functions/v2/https";
import { getAppCheckMode } from "../lib/env.js";

export async function appCheckSoft(
  req: any,
  options: { alwaysSoft?: boolean } = {}
): Promise<void> {
  const mode = getAppCheckMode();
  if (mode === "disabled") return;
  const strict = !options.alwaysSoft && mode === "strict";
  const token = String(
    req.get?.("X-Firebase-AppCheck") ||
      req.headers?.["x-firebase-app-check"] ||
      ""
  );
  if (!token) {
    logger.warn("appcheck_missing_soft");
    if (strict) {
      throw new HttpsError(
        "permission-denied",
        "Valid App Check token required"
      );
    }
    return;
  }
  try {
    await getAppCheck().verifyToken(token);
  } catch (e: any) {
    logger.warn("appcheck_invalid_soft", { err: e?.message });
    if (strict) {
      throw new HttpsError(
        "permission-denied",
        "Valid App Check token required"
      );
    }
  }
}
