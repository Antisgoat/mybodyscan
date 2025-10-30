import { auth } from "./firebase";

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
const MAX_SESSION_EVENTS = 40;
const sentKeys = new Set<string>();
let sessionCount = 0;
let listenersBound = false;

function buildKey(message?: string | null, stack?: string | null): string {
  return `${message || ""}|${stack || ""}`.slice(0, 500);
}

async function getAuthToken(): Promise<string | undefined> {
  try {
    const user = auth.currentUser;
    if (!user) return undefined;
    return await user.getIdToken();
  } catch (error) {
    console.warn("telemetry_token_error", (error as Error)?.message);
    return undefined;
  }
}

export async function reportError(payload: TelemetryPayload): Promise<void> {
  if (!payload || !payload.kind) return;
  if (sessionCount >= MAX_SESSION_EVENTS) return;

  const key = buildKey(payload.message, payload.stack);
  if (key && sentKeys.has(key)) {
    return;
  }
  if (key) {
    sentKeys.add(key);
  }

  sessionCount += 1;

  const body = {
    kind: payload.kind,
    message: payload.message,
    code: payload.code,
    stack: payload.stack,
    url: payload.url || (typeof window !== "undefined" ? window.location.href : undefined),
    component: payload.component,
    extra: payload.extra || undefined,
  };

  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const token = await getAuthToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    const response = await fetch(TELEMETRY_ENDPOINT, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      keepalive: true,
    });
    if (!response.ok && import.meta.env.DEV) {
      console.info("[telemetry] failed", response.status);
    } else if (import.meta.env.DEV) {
      console.info("[telemetry] sent", payload.kind, payload.message?.slice(0, 60) ?? "");
    }
  } catch (error) {
    if (import.meta.env.DEV) {
      console.info("[telemetry] error", (error as Error)?.message ?? error);
    }
  }
}

function normalizeErrorMessage(error: unknown): { message: string; stack?: string } {
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
  const detail = normalizeErrorMessage(event.error ?? event.message ?? "Unhandled error");
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
  window.addEventListener("error", onWindowError);
  window.addEventListener("unhandledrejection", onUnhandledRejection);
}
