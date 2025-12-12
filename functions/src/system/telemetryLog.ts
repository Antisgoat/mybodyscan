import type { Request, Response } from "express";
import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { identifierFromRequest } from "../http/_middleware.js";

type TelemetryBody = {
  kind?: string;
  message?: string;
  code?: string | number;
  stack?: string;
  url?: string;
  component?: string;
  extra?: unknown;
  // legacy callable payload shape
  fn?: string;
};

function coerceBody(req: any): { body: TelemetryBody | null; isCallable: boolean } {
  const raw = req?.body;
  if (!raw) return { body: null, isCallable: false };
  // Callable protocol: { data: { ... } }
  if (raw && typeof raw === "object" && "data" in raw) {
    const data = (raw as any).data;
    if (data && typeof data === "object") {
      return { body: data as TelemetryBody, isCallable: true };
    }
    return { body: null, isCallable: true };
  }
  if (typeof raw === "object") {
    return { body: raw as TelemetryBody, isCallable: false };
  }
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        return { body: parsed as TelemetryBody, isCallable: false };
      }
    } catch {
      // ignore
    }
  }
  return { body: null, isCallable: false };
}

function sanitizeString(value: unknown, limit: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, limit);
}

// IMPORTANT:
// - Must accept both hosting rewrite POSTs to `/telemetry/log` (plain JSON fetch)
//   and Firebase callable protocol POSTs (body: { data: ... }).
// - Must never return 400s for malformed payloads (telemetry is best-effort).
export const telemetryLog = onRequest(
  { region: "us-central1", cors: true },
  async (req: Request, res: Response) => {
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }

    const { body, isCallable } = coerceBody(req);

    // Keep telemetry non-blocking: even invalid payloads return 200.
    const ip = identifierFromRequest(req);
    const kind = sanitizeString(body?.kind, 80);
    const fn = sanitizeString(body?.fn, 120);
    const code =
      typeof body?.code === "string" || typeof body?.code === "number"
        ? String(body.code).slice(0, 120)
        : null;
    const message = sanitizeString(body?.message, 600);
    const url = sanitizeString(body?.url, 600);
    const component = sanitizeString(body?.component, 180);

    logger.warn("telemetry", {
      ip,
      kind,
      fn,
      code,
      message,
      url,
      component,
    });

    // Callable clients expect `{ data: ... }`. Fetch callers don't care.
    res.status(200).json(isCallable ? { data: { ok: true } } : { ok: true });
  }
);
