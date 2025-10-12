import rateLimit from "express-rate-limit";
import type { Request } from "express";
import * as admin from "firebase-admin";
if (!admin.apps.length) admin.initializeApp();
import { FieldValue } from "firebase-admin/firestore";
import { getEnv, getEnvInt } from "./lib/env.js";

export function createApiLimiter() {
  const windowMs = getEnvInt("RATE_LIMIT_WINDOW_MS", 60_000);
  const limit = getEnvInt("RATE_LIMIT_MAX", 60);

  return rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req: Request) => {
      const allowed = (getEnv("APP_CHECK_ALLOWED_ORIGINS") || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const origin = (req.headers?.origin as string | undefined) || "";
      return Boolean(origin) && allowed.includes(origin);
    },
  });
}

type Opts = { key: string; max: number; windowSeconds: number };

export async function verifyRateLimit(req: any, opts: Opts) {
  const uid = (req as any).auth?.uid || (req as any).user?.uid || "";
  const ip = (req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "")
    .toString()
    .split(",")[0]
    .trim();
  const id = uid || ip || "anon";
  const key = `${opts.key}:${id}`;
  const now = Date.now();

  const ref = admin.firestore().collection("ratelimits").doc(key);
  await admin.firestore().runTransaction(async (tx: FirebaseFirestore.Transaction) => {
    const snap = (await tx.get(ref)) as unknown as FirebaseFirestore.DocumentSnapshot<FirebaseFirestore.DocumentData>;
    const data = snap.exists ? (snap.data() as any) : { count: 0, windowStart: now };
    const elapsed = now - (data.windowStart || now);
    if (elapsed > opts.windowSeconds * 1000) {
      tx.set(ref, { count: 1, windowStart: now, updatedAt: FieldValue.serverTimestamp() });
      return;
    }
    const next = (data.count || 0) + 1;
    tx.set(
      ref,
      { count: next, windowStart: data.windowStart, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
    if (next > opts.max) {
      const e: any = new Error("Too Many Requests");
      e.status = 429;
      throw e;
    }
  });
}
