import rateLimit from "../vendor/express-rate-limit/index.js";
import { getEnv, getEnvInt } from "./lib/env.js";

export function createApiLimiter() {
  const windowMs = getEnvInt("RATE_LIMIT_WINDOW_MS", 60_000);
  const limit = getEnvInt("RATE_LIMIT_MAX", 60);
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req: any) => {
      const allowed = (getEnv("APP_CHECK_ALLOWED_ORIGINS") || "")
        .split(",").map(s=>s.trim()).filter(Boolean);
      const origin = (req?.headers?.origin as string) || "";
      return !!origin && allowed.includes(origin);
    },
  });
}
export default createApiLimiter;
