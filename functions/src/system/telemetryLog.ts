import { onCallWithOptionalAppCheck } from "../util/callable.js";
import * as logger from "firebase-functions/logger";
import { enforceRateLimit } from "../middleware/rateLimit.js";
import { diagnosticText } from "./telemetryPrivacy.js";

export const telemetryLog = onCallWithOptionalAppCheck(async (req) => {
  if (!req.auth?.uid) return { ok: true };
  try {
    await enforceRateLimit({
      uid: req.auth.uid,
      key: "telemetry",
      limit: 30,
      windowMs: 300_000,
    });
  } catch {
    return { ok: true };
  }
  const { fn, code, message } = req.data || {};
  logger.warn("telemetry", {
    uid: req.auth?.uid || "anon",
    fn: diagnosticText(fn, 100),
    code: diagnosticText(typeof code === "number" ? String(code) : code, 100),
    message: diagnosticText(message, 320),
  });
  return { ok: true };
});
