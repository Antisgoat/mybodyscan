import type { Request, Response } from "express";
import { onRequest } from "firebase-functions/v2/https";
import { FieldValue, Timestamp, getFirestore } from "../firebase.js";
import { ensureRateLimit, identifierFromRequest } from "./_middleware.js";

const db = getFirestore();
const ALLOWED_ORIGINS = new Set([
  "https://mybodyscanapp.com",
  "https://www.mybodyscanapp.com",
  "https://mybodyscan-f3daf.web.app",
  "https://mybodyscan-f3daf.firebaseapp.com",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

interface TelemetryBody {
  kind?: string;
  message?: string;
  code?: string | number;
  stack?: string;
  url?: string;
  component?: string;
  extra?: unknown;
}

function applyCors(req: Request, res: Response): { ended: boolean } {
  const origin = req.headers.origin as string | undefined;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Vary", "Origin");
  }
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
    res.status(204).end();
    return { ended: true };
  }
  return { ended: false };
}

function sanitizeString(value: unknown, limit: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, limit);
}

function normalizeExtra(extra: unknown): Record<string, unknown> | null {
  if (!extra) return null;
  if (typeof extra === "object" && !Array.isArray(extra)) {
    return Object.fromEntries(
      Object.entries(extra as Record<string, unknown>).map(([key, value]) => [key, typeof value === "string" ? value.slice(0, 200) : value]),
    );
  }
  try {
    return { value: JSON.parse(JSON.stringify(extra)).toString().slice(0, 200) };
  } catch {
    return { value: String(extra).slice(0, 200) };
  }
}

async function identifyUid(req: Request): Promise<string | null> {
  const header = req.get("authorization") || req.get("Authorization");
  if (!header) return null;
  const match = header.match(/^Bearer (.+)$/);
  if (!match) return null;
  const { getAuth } = await import("../firebase.js");
  try {
    const decoded = await getAuth().verifyIdToken(match[1]!);
    return decoded.uid || null;
  } catch (error) {
    console.warn("telemetry_auth_invalid", { message: (error as Error)?.message });
    return null;
  }
}

export const telemetryLog = onRequest({ region: "us-central1" }, async (req: Request, res: Response) => {
  const cors = applyCors(req, res);
  if (cors.ended) return;

  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  let body: TelemetryBody | null = null;
  try {
    body = typeof req.body === "object" && req.body ? (req.body as TelemetryBody) : null;
  } catch {
    body = null;
  }

  if (!body) {
    res.status(400).json({ error: "invalid_payload" });
    return;
  }

  const uid = await identifyUid(req);
  const ip = identifierFromRequest(req);

  const limitKey = uid ? `telemetry_uid_${uid}` : `telemetry_ip_${ip}`;
  const limitResult = await ensureRateLimit({
    key: limitKey,
    identifier: uid || ip,
    limit: 10,
    windowSeconds: 300,
  });

  if (!limitResult.allowed) {
    res.status(429).json({ error: "rate_limited", retryAfter: limitResult.retryAfterSeconds ?? null });
    return;
  }

  const doc = {
    createdAt: Timestamp.now(),
    uid: uid ?? null,
    ip: ip || null,
    userAgent: sanitizeString(req.get("user-agent"), 300),
    url: sanitizeString(body.url, 500),
    kind: sanitizeString(body.kind, 100),
    message: sanitizeString(body.message, 320),
    code: typeof body.code === "string" || typeof body.code === "number" ? String(body.code).slice(0, 120) : null,
    stack: sanitizeString(body.stack, 1200),
    component: sanitizeString(body.component, 120),
    extra: normalizeExtra(body.extra),
    headers: {
      referer: sanitizeString(req.get("referer") || req.get("referrer"), 500),
    },
  };

  try {
    await db.collection("telemetryEvents").add({
      ...doc,
      recordedAt: FieldValue.serverTimestamp(),
    });
  } catch (error) {
    console.error("telemetry_store_error", { message: (error as Error)?.message });
    res.status(500).json({ error: "store_failed" });
    return;
  }

  res.json({ ok: true });
});
