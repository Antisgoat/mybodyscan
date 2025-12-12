const toInt = (value, fallback) => {
  const num = Number.parseInt(value, 10);
  return Number.isFinite(num) && num > 0 ? num : fallback;
};

const defaultKeyGenerator = (req) => {
  const forwarded = req?.headers?.["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0]?.trim() || "anonymous";
  }
  if (Array.isArray(forwarded) && forwarded.length > 0) {
    return forwarded[0] || "anonymous";
  }
  const ip =
    req?.ip || req?.socket?.remoteAddress || req?.connection?.remoteAddress;
  if (typeof ip === "string" && ip.length > 0) return ip;
  return "anonymous";
};

const setHeader = (res, name, value) => {
  if (!res || typeof res.setHeader !== "function") return;
  try {
    res.setHeader(name, value);
  } catch {
    // ignore header errors
  }
};

const asTimestampSeconds = (ms) => Math.ceil(ms / 1000);

export default function rateLimit(options = {}) {
  const windowMs = toInt(options.windowMs, 60_000);
  const limitOption = options.limit ?? options.max;
  const limit = toInt(limitOption, 60);
  const standardHeaders =
    options.standardHeaders !== undefined
      ? Boolean(options.standardHeaders)
      : false;
  const legacyHeaders =
    options.legacyHeaders !== undefined ? Boolean(options.legacyHeaders) : true;
  const skip = typeof options.skip === "function" ? options.skip : () => false;
  const keyGenerator =
    typeof options.keyGenerator === "function"
      ? options.keyGenerator
      : defaultKeyGenerator;
  const message =
    options.message ?? "Too many requests, please try again later.";
  const onLimitReached =
    typeof options.onLimitReached === "function"
      ? options.onLimitReached
      : null;
  const handler =
    typeof options.handler === "function" ? options.handler : null;

  const hits = new Map();

  return function rateLimitMiddleware(req, res, next) {
    try {
      if (skip(req, res)) {
        return next?.();
      }

      const now = Date.now();
      const key = keyGenerator(req, res) || "anonymous";
      const current = hits.get(key);
      const resetTime = now + windowMs;

      if (!current || current.reset <= now) {
        hits.set(key, { count: 1, reset: resetTime });
        applyHeaders(
          res,
          limit,
          limit - 1,
          resetTime,
          standardHeaders,
          legacyHeaders
        );
        return next?.();
      }

      current.count += 1;
      const remaining = Math.max(limit - current.count, 0);
      applyHeaders(
        res,
        limit,
        remaining,
        current.reset,
        standardHeaders,
        legacyHeaders
      );

      if (current.count > limit) {
        if (onLimitReached) {
          try {
            onLimitReached(req, res, options);
          } catch {
            // ignore listener errors
          }
        }
        if (handler) {
          return handler(req, res, next, options);
        }
        if (
          res &&
          typeof res.status === "function" &&
          typeof res.send === "function"
        ) {
          res.status(429).send(message);
          return;
        }
        const error = new Error("Too Many Requests");
        error.status = 429;
        return next?.(error);
      }

      return next?.();
    } catch (error) {
      return next?.(error);
    }
  };
}

function applyHeaders(
  res,
  limit,
  remaining,
  resetTime,
  standardHeaders,
  legacyHeaders
) {
  if (standardHeaders) {
    setHeader(res, "RateLimit-Limit", String(limit));
    setHeader(res, "RateLimit-Remaining", String(remaining));
    setHeader(res, "RateLimit-Reset", String(asTimestampSeconds(resetTime)));
  }
  if (legacyHeaders) {
    setHeader(res, "X-RateLimit-Limit", String(limit));
    setHeader(res, "X-RateLimit-Remaining", String(remaining));
    setHeader(res, "X-RateLimit-Reset", String(asTimestampSeconds(resetTime)));
  }
}

export { rateLimit };
