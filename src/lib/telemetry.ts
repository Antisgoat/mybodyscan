import { enqueue, initTelemetryClient, type TelemetryClientEvent } from "@/lib/telemetry/client";

export type TelemetryPayload = {
  kind: string;
  message: string;
  code?: string;
  stack?: string;
  url?: string;
  component?: string;
  extra?: Record<string, unknown>;
};

const TELEMETRY_ENDPOINT = "/telemetry/log";
let listenersBound = false;

function isTestLikeEnv(): boolean {
  // Vitest runs in Node where relative fetch URLs throw (and we don't want noisy logs).
  try {
    const mode = (import.meta as any)?.env?.MODE;
    if (mode === "test") return true;
  } catch {
    // ignore
  }
  // Common heuristic for Vitest/Jest
  return Boolean((globalThis as any).__vitest_worker__ || (globalThis as any).jest);
}

function resolveTelemetryUrl(): string | null {
  if (typeof window === "undefined") return null;
  try {
    // Ensure absolute URL so Node's fetch (used by vitest/jsdom) won't throw on a relative path.
    return new URL(TELEMETRY_ENDPOINT, window.location.origin).toString();
  } catch {
    return null;
  }
}

function stripUndefinedDeep(value: unknown, depth = 0): unknown {
  if (depth > 6) return undefined;
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (Array.isArray(value)) {
    const arr = value
      .map((v) => stripUndefinedDeep(v, depth + 1))
      .filter((v) => v !== undefined);
    return arr;
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const next = stripUndefinedDeep(v, depth + 1);
      if (next !== undefined) out[k] = next;
    }
    return out;
  }
  return value;
}

export function buildTelemetryBody(payload: TelemetryPayload): Record<string, unknown> {
  const body = {
    kind: payload.kind,
    message: payload.message,
    code: payload.code,
    stack: payload.stack,
    url:
      payload.url ||
      (typeof window !== "undefined" ? window.location.href : undefined),
    component: payload.component,
    extra: payload.extra || undefined,
  };
  return (stripUndefinedDeep(body) as Record<string, unknown>) || {};
}

export async function reportError(payload: TelemetryPayload): Promise<void> {
  try {
    if (!payload || !payload.kind) return;
    if (isTestLikeEnv()) return;
    // Ensure absolute URL resolution works (and avoids oddities in test envs).
    // If URL can't be resolved, just drop (best-effort).
    if (!resolveTelemetryUrl()) return;

    const body = buildTelemetryBody(payload) as TelemetryClientEvent;
    enqueue(body);
  } catch {
    // Telemetry must never throw.
  }
}

function normalizeErrorMessage(error: unknown): {
  message: string;
  stack?: string;
} {
  if (error instanceof Error) {
    return { message: error.message, stack: error.stack ?? undefined };
  }
  if (typeof error === "string") {
    return { message: error };
  }
  try {
    return { message: JSON.stringify(error) };
  } catch {
    return { message: String(error) };
  }
}

function onWindowError(event: ErrorEvent) {
  const detail = normalizeErrorMessage(
    event.error ?? event.message ?? "Unhandled error"
  );
  void reportError({
    kind: "window_error",
    message: detail.message,
    stack: detail.stack,
    url: event.filename || window.location.href,
    extra: {
      col: event.colno,
      line: event.lineno,
      type: event.type,
    },
  });
}

function onUnhandledRejection(event: PromiseRejectionEvent) {
  const detail = normalizeErrorMessage(event.reason ?? "unhandled rejection");
  void reportError({
    kind: "unhandled_rejection",
    message: detail.message,
    stack: detail.stack,
    url: typeof window !== "undefined" ? window.location.href : undefined,
  });
}

export function initTelemetry(): void {
  if (typeof window === "undefined" || listenersBound) return;
  listenersBound = true;
  try {
    initTelemetryClient();
  } catch {
    // ignore
  }
  window.addEventListener("error", onWindowError);
  window.addEventListener("unhandledrejection", onUnhandledRejection);
}
