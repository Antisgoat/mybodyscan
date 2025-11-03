import { onCallWithOptionalAppCheck } from "../util/callable.js";
import * as logger from "firebase-functions/logger";

export const telemetryLog = onCallWithOptionalAppCheck(async (req) => {
  const { fn, code, message } = req.data || {};
  logger.warn("telemetry", {
    uid: req.auth?.uid || "anon",
    fn,
    code,
    message,
  });
  return { ok: true };
});
