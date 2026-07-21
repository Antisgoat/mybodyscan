import rateLimit from "../vendor/express-rate-limit/index.js";
import { getEnvInt } from "./lib/env.js";

export function createApiLimiter() {
  const windowMs = getEnvInt("RATE_LIMIT_WINDOW_MS", 60_000);
  const limit = getEnvInt("RATE_LIMIT_MAX", 60);

  return rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
  });
}

export default createApiLimiter;
