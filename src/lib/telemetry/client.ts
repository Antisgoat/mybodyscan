import { getCachedUser, getIdToken } from "@/lib/authFacade";
import { getAppCheckHeader } from "@/lib/appCheck";

export type TelemetryClientEvent = {
  kind: string;
  message: string;
  code?: string;
  stack?: string;
  url?: string;
  component?: string;
  extra?: Record<string, unknown>;
};

type EnqueueOptions = {
  /** Override route used for dedupe; defaults to window.location.pathname */
  route?: string | null;
  /** Override uid used for dedupe; defaults to current auth user uid */
  uid?: string | null;
};

const TELEMETRY_ENDPOINT = "/telemetry/log";

const DEDUPE_TTL_MS = 30_000;
const THROTTLE_MS = 5_000;
const FLUSH_INTERVAL_MS = 10_000;
const MAX_BATCH_EVENTS = 20;
const MAX_QUEUE_EVENTS = 100;
const BACKOFF_429_MS = 60_000;

const queue: TelemetryClientEvent[] = [];
const lastSeenAt = new Map<string, number>();

type TelemetryDebugSnapshot = {
  queueSize: number;
  inFlight: boolean;
  nextAllowedSendInMs: number;
  backoffRemainingMs: number;
  counts: {
    enqueued: number;
    droppedDedupe: number;
    droppedOverflow: number;
    droppedNoUrl: number;
    flushesAttempted: number;
    flushesThrottled: number;
    flushesBackedOff: number;
    sentBeacon: number;
    sentFetch: number;
    requeued429: number;
  };
};

const debugCounts: TelemetryDebugSnapshot["counts"] = {
  enqueued: 0,
  droppedDedupe: 0,
  droppedOverflow: 0,
  droppedNoUrl: 0,
  flushesAttempted: 0,
  flushesThrottled: 0,
  flushesBackedOff: 0,
  sentBeacon: 0,
  sentFetch: 0,
  requeued429: 0,
};

let started = false;
let flushTimer: number | null = null;
let inFlight = false;
let nextAllowedSendAt = 0;
let backoffUntil = 0;

function nowMs(): number {
  return Date.now();
}

function getRouteFallback(): string {
  try {
    return typeof window !== "undefined" ? window.location.pathname : "";
  } catch {
    return "";
  }
}

function getUidFallback(): string | null {
  try {
    return getCachedUser()?.uid ?? null;
  } catch {
    return null;
  }
}

function resolveTelemetryUrl(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return new URL(TELEMETRY_ENDPOINT, window.location.origin).toString();
  } catch {
    return null;
  }
}

function computeDedupeName(event: TelemetryClientEvent): string {
  const phase =
    event?.extra && typeof event.extra === "object"
      ? ((event.extra as Record<string, unknown>).phase as unknown)
      : null;
  const phaseStr = typeof phase === "string" && phase.trim().length ? phase.trim() : null;
  return phaseStr ? `${event.kind}:${phaseStr}` : event.kind;
}

function computeDedupeKey(event: TelemetryClientEvent, route: string, uid: string | null): string {
  const name = computeDedupeName(event);
  return `${name}|${route || ""}|${uid || ""}`.slice(0, 500);
}

function clampQueue(): void {
  if (queue.length <= MAX_QUEUE_EVENTS) return;
  const overflow = queue.length - MAX_QUEUE_EVENTS;
  if (overflow <= 0) return;
  queue.splice(0, overflow);
  debugCounts.droppedOverflow += overflow;
}

async function getAuthToken(): Promise<string | undefined> {
  try {
    const token = await getIdToken();
    return token || undefined;
  } catch {
    return undefined;
  }
}

function startIfNeeded(): void {
  if (started) return;
  started = true;

  if (typeof window !== "undefined") {
    try {
      const flushOnHide = () => {
        void flush({ useBeacon: true, reason: "pagehide" });
      };
      window.addEventListener("pagehide", flushOnHide);
      window.addEventListener("beforeunload", flushOnHide);
      document.addEventListener("visibilitychange", () => {
        try {
          if (document.visibilityState === "hidden") {
            void flush({ useBeacon: true, reason: "visibility_hidden" });
          }
        } catch {
          // ignore
        }
      });
    } catch {
      // ignore
    }
  }

  try {
    flushTimer = window.setInterval(() => {
      void flush({ useBeacon: false, reason: "interval" });
    }, FLUSH_INTERVAL_MS);
  } catch {
    flushTimer = null;
  }

  // Dev-only debugging hook (no UI impact; safe to ignore).
  if (typeof window !== "undefined" && import.meta.env.DEV) {
    try {
      (window as any).__mbsTelemetry = {
        getSnapshot: getDebugSnapshot,
        flush: () => flush({ useBeacon: false, reason: "manual" }),
      };
    } catch {
      // ignore
    }
  }
}

export function enqueue(event: TelemetryClientEvent, options?: EnqueueOptions): void {
  try {
    if (!event || !event.kind) return;
    startIfNeeded();

    const t = nowMs();
    const route = (options?.route ?? getRouteFallback()) || "";
    const uid = options?.uid ?? getUidFallback();
    const dedupeKey = computeDedupeKey(event, route, uid);
    const last = lastSeenAt.get(dedupeKey) ?? 0;
    if (t - last < DEDUPE_TTL_MS) {
      debugCounts.droppedDedupe += 1;
      return;
    }
    lastSeenAt.set(dedupeKey, t);

    const extra = {
      ...(event.extra ?? {}),
      route: (((event.extra as any)?.route ?? route) || null) as unknown,
      clientAt: (event.extra as any)?.clientAt ?? t,
    } as Record<string, unknown>;

    queue.push({
      ...event,
      // Preserve explicit url if provided; otherwise capture current href.
      url:
        event.url ??
        (typeof window !== "undefined" ? window.location.href : undefined),
      extra,
    });
    debugCounts.enqueued += 1;
    clampQueue();
  } catch {
    // Telemetry must never throw.
  }
}

export async function flush(options?: { useBeacon?: boolean; reason?: string }): Promise<void> {
  try {
    startIfNeeded();
    if (!queue.length) return;

    debugCounts.flushesAttempted += 1;
    const t = nowMs();
    if (t < backoffUntil) {
      debugCounts.flushesBackedOff += 1;
      return;
    }
    if (t < nextAllowedSendAt) {
      debugCounts.flushesThrottled += 1;
      return;
    }
    if (inFlight) return;

    const url = resolveTelemetryUrl();
    if (!url) {
      // No window / no origin; drop silently (best-effort).
      debugCounts.droppedNoUrl += queue.length;
      queue.splice(0, queue.length);
      return;
    }

    const events = queue.splice(0, Math.min(MAX_BATCH_EVENTS, queue.length));
    const payload = { events };

    // Throttle regardless of result to avoid tight retry loops.
    nextAllowedSendAt = t + THROTTLE_MS;
    inFlight = true;

    const useBeacon =
      Boolean(options?.useBeacon) &&
      typeof navigator !== "undefined" &&
      typeof navigator.sendBeacon === "function";

    if (useBeacon) {
      try {
        const blob = new Blob([JSON.stringify(payload)], {
          type: "application/json",
        });
        const ok = navigator.sendBeacon(url, blob);
        if (!ok) {
          // If the beacon queue is full, just drop (best-effort, no spam).
        }
        debugCounts.sentBeacon += 1;
        return;
      } catch {
        return;
      } finally {
        inFlight = false;
      }
    }

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      // Optional auth + AppCheck (best-effort only).
      const token = await getAuthToken();
      if (token) headers.Authorization = `Bearer ${token}`;
      try {
        const appCheckHeader = await getAppCheckHeader(false);
        Object.assign(headers, appCheckHeader);
      } catch {
        // ignore
      }

      const resp = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        keepalive: true,
      });
      debugCounts.sentFetch += 1;

      if (resp.status === 429) {
        // Back off and re-queue (bounded).
        backoffUntil = nowMs() + BACKOFF_429_MS;
        debugCounts.requeued429 += events.length;
        queue.unshift(...events);
        clampQueue();
      }
      // For all other failures, drop silently (best-effort).
    } catch {
      // Drop silently (best-effort).
    } finally {
      inFlight = false;
    }
  } catch {
    // Telemetry must never throw.
    try {
      inFlight = false;
    } catch {
      // ignore
    }
  }
}

export function initTelemetryClient(): void {
  // Public init hook (safe to call multiple times).
  try {
    startIfNeeded();
  } catch {
    // ignore
  }
}

export function getDebugSnapshot(): TelemetryDebugSnapshot {
  const t = nowMs();
  return {
    queueSize: queue.length,
    inFlight,
    nextAllowedSendInMs: Math.max(0, nextAllowedSendAt - t),
    backoffRemainingMs: Math.max(0, backoffUntil - t),
    counts: { ...debugCounts },
  };
}

export const __telemetryClientTestInternals = {
  reset() {
    try {
      queue.splice(0, queue.length);
      lastSeenAt.clear();
      inFlight = false;
      nextAllowedSendAt = 0;
      backoffUntil = 0;
      if (flushTimer != null) {
        try {
          clearInterval(flushTimer);
        } catch {
          // ignore
        }
      }
      flushTimer = null;
      started = false;
      for (const key of Object.keys(debugCounts) as Array<keyof typeof debugCounts>) {
        debugCounts[key] = 0;
      }
    } catch {
      // ignore
    }
  },
};

