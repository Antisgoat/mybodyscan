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
  // Local dev / preview / emulators
  "http://localhost",
  "http://127.0.0.1",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:8080",
  "http://127.0.0.1:8080",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
  "http://localhost:5000",
  "http://127.0.0.1:5000",
  // iOS wrappers / WebViews (Capacitor/Ionic)
  "capacitor://localhost",
  "ionic://localhost",
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

type TelemetryBatchBody = {
  events?: unknown;
};

function applyCors(req: Request, res: Response): { ended: boolean } {
  const origin = req.headers.origin as string | undefined;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Vary", "Origin");
  }
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type,Authorization,X-Firebase-AppCheck"
    );
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
    const entries = Object.entries(extra as Record<string, unknown>).slice(0, 50);
    return Object.fromEntries(
      entries.map(([key, value]) => [key, normalizeExtraValue(value)])
    );
  }
  try {
    return {
      value: JSON.parse(JSON.stringify(extra)).toString().slice(0, 200),
    };
  } catch {
    return { value: String(extra).slice(0, 200) };
  }
}

function normalizeExtraValue(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value === "string") return value.slice(0, 200);
  if (typeof value === "number" || typeof value === "boolean") return value;
  try {
    return JSON.stringify(value).slice(0, 800);
  } catch {
    return String(value).slice(0, 200);
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
    console.warn("telemetry_auth_invalid", {
      message: (error as Error)?.message,
    });
    return null;
  }
}

export const telemetryLogHttp = onRequest(
  { region: "us-central1" },
  async (req: Request, res: Response) => {
    const cors = applyCors(req, res);
    if (cors.ended) return;

    if (req.method !== "POST") {
      res.status(405).json({ error: "method_not_allowed" });
      return;
    }

    let eventsRaw: unknown[] = [];
    try {
      const root =
        typeof req.body === "object" && req.body
          ? (req.body as TelemetryBody & TelemetryBatchBody)
          : null;
      if (root && Array.isArray((root as any).events)) {
        eventsRaw = (root as any).events as unknown[];
      } else if (root) {
        eventsRaw = [root as TelemetryBody];
      } else {
        eventsRaw = [];
      }
    } catch {
      eventsRaw = [];
    }

    const events = eventsRaw
      .filter((entry): entry is TelemetryBody => Boolean(entry && typeof entry === "object"))
      .slice(0, 20);

    if (!events.length) {
      // Best-effort: telemetry must never spam clients with errors.
      res.status(204).end();
      return;
    }

    const uid = await identifyUid(req);
    const ip = identifierFromRequest(req);

    const limitKey = uid ? `telemetry_uid_${uid}` : `telemetry_ip_${ip}`;
    const limitResult = await ensureRateLimit({
      key: limitKey,
      identifier: uid || ip,
      // Requests are batched on the client; this is a per-request guardrail.
      // When limited, we drop events but still respond 204 to avoid browser console noise.
      limit: 120,
      windowSeconds: 300,
    });

    if (!limitResult.allowed) {
      try {
        if (typeof limitResult.retryAfterSeconds === "number") {
          res.setHeader("Retry-After", String(limitResult.retryAfterSeconds));
        }
      } catch {
        // ignore
      }
      // Drop silently (best-effort).
      res.status(204).end();
      return;
    }

    try {
      const batch = db.batch();
      const createdAt = Timestamp.now();
      const ua = sanitizeString(req.get("user-agent"), 300);
      const referer = sanitizeString(req.get("referer") || req.get("referrer"), 500);

      for (const body of events) {
        const doc = {
          createdAt,
          uid: uid ?? null,
          ip: ip || null,
          userAgent: ua,
          url: sanitizeString(body.url, 500),
          kind: sanitizeString(body.kind, 100),
          message: sanitizeString(body.message, 320),
          code:
            typeof body.code === "string" || typeof body.code === "number"
              ? String(body.code).slice(0, 120)
              : null,
          stack: sanitizeString(body.stack, 1200),
          component: sanitizeString(body.component, 120),
          extra: normalizeExtra(body.extra),
          headers: { referer },
          recordedAt: FieldValue.serverTimestamp(),
        };
        const ref = db.collection("telemetryEvents").doc();
        batch.set(ref, doc, { merge: false });
      }

      await batch.commit();
    } catch (error) {
      console.error("telemetry_store_error", {
        message: (error as Error)?.message,
      });
      // Best-effort: don't surface errors to the browser.
      res.status(204).end();
      return;
    }

    res.status(204).end();
  }
);
