import { createHash } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { FieldValue, Timestamp, getFirestore } from "../firebase.js";

const db = getFirestore();

interface RateLimitOptions {
  key: string;
  limit: number;
  windowSeconds: number;
  identifier: string;
}

interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds?: number;
}

function makeDocId(key: string, identifier: string): string {
  const hash = createHash("sha1").update(identifier).digest("hex");
  return `${key}_${hash}`.slice(0, 120);
}

async function recordAttempt(options: RateLimitOptions): Promise<RateLimitResult> {
  const { key, identifier, limit, windowSeconds } = options;
  const docId = makeDocId(key, identifier);
  const ref = db.doc(`rateLimits/${docId}`) as FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData>;
  const now = Timestamp.now();
  const windowStart = now.toMillis() - windowSeconds * 1000;

  return await db.runTransaction(async (tx: FirebaseFirestore.Transaction) => {
    const snap = (await tx.get(ref)) as FirebaseFirestore.DocumentSnapshot<FirebaseFirestore.DocumentData>;
    const data = snap.exists ? (snap.data() as Record<string, unknown>) : {};
    const events: Timestamp[] = Array.isArray(data.events)
      ? data.events.filter((item): item is Timestamp => item instanceof Timestamp)
      : [];
    const recent = events.filter((event) => event.toMillis() >= windowStart);

    if (recent.length >= limit) {
      const oldest = recent[0];
      const retryAfterMs = oldest ? oldest.toMillis() + windowSeconds * 1000 - now.toMillis() : windowSeconds * 1000;
      const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
      return { allowed: false, retryAfterSeconds };
    }

    recent.push(now);
    const trimmed = recent.slice(-limit);

    tx.set(
      ref,
      {
        key,
        identifier,
        events: trimmed,
        limit,
        windowSeconds,
        updatedAt: now,
        lastAttempt: FieldValue.serverTimestamp(),
        count: FieldValue.increment(1),
      },
      { merge: true },
    );

    return { allowed: true };
  });
}

export async function ensureRateLimit(options: RateLimitOptions): Promise<RateLimitResult> {
  try {
    return await recordAttempt(options);
  } catch (error) {
    console.error("rate_limit_store_error", {
      key: options.key,
      identifier: options.identifier,
      message: (error as Error)?.message,
    });
    throw error;
  }
}

export function withRateLimit(
  optionsFactory: (req: Request) => RateLimitOptions | null | undefined,
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const config = optionsFactory(req);
      if (!config) {
        next();
        return;
      }
      const result = await ensureRateLimit(config);
      if (!result.allowed) {
        res.status(429).json({ error: "rate_limited", retryAfter: result.retryAfterSeconds ?? null });
        return;
      }
      next();
    } catch (error) {
      res.status(429).json({ error: "rate_limited", retryAfter: null });
    }
  };
}

export function identifierFromRequest(req: Request): string {
  const forwarded = (req.get("x-forwarded-for") || "").split(",")[0]?.trim();
  if (forwarded) return forwarded;
  const expressIp = (req as any).ip;
  if (typeof expressIp === "string" && expressIp) return expressIp;
  return "unknown";
}
