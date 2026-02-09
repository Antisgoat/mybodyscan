export type OnlineStatus = "unknown" | "online" | "offline";

type Listener = (status: OnlineStatus) => void;

const listeners = new Set<Listener>();
let currentStatus: OnlineStatus =
  typeof navigator !== "undefined" && navigator.onLine === false
    ? "offline"
    : "unknown";
let pollingTimer: number | null = null;
let inFlightCheck: Promise<OnlineStatus> | null = null;
let monitoring = false;

const ONLINE_POLL_MS = 15_000;
const OFFLINE_POLL_MS = 30_000;
const CHECK_TIMEOUT_MS = 3_000;
const DEFAULT_PROBE_URL = "https://mybodyscanapp.com";

function emit(status: OnlineStatus) {
  currentStatus = status;
  for (const listener of listeners) {
    try {
      listener(status);
    } catch {
      // ignore listener errors
    }
  }
}

function getProbeUrl(): string {
  const envUrl = (import.meta as any).env?.VITE_NETWORK_PROBE_URL;
  const fallback = DEFAULT_PROBE_URL;
  if (typeof envUrl !== "string" || !envUrl.trim()) {
    return fallback;
  }
  return envUrl.trim();
}

function buildProbeRequest(url: string): { url: string; init: RequestInit } {
  let probeUrl = url;
  try {
    const parsed = new URL(url, typeof window !== "undefined" ? window.location.href : undefined);
    parsed.searchParams.set("cacheBust", String(Date.now()));
    probeUrl = parsed.toString();
  } catch {
    probeUrl = `${url}${url.includes("?") ? "&" : "?"}cacheBust=${Date.now()}`;
  }
  return {
    url: probeUrl,
    init: {
      method: "GET",
      cache: "no-store",
      mode: "no-cors",
    },
  };
}

async function runReachabilityCheck(): Promise<OnlineStatus> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return "offline";
  }
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  let timeoutId: number | null = null;
  try {
    const { url, init } = buildProbeRequest(getProbeUrl());
    const timeoutPromise =
      typeof window !== "undefined"
        ? new Promise<OnlineStatus>((resolve) => {
            timeoutId = window.setTimeout(() => {
              controller?.abort();
              resolve("offline");
            }, CHECK_TIMEOUT_MS);
          })
        : null;
    const fetchPromise = fetch(url, {
      ...init,
      signal: controller?.signal,
    })
      .then(() => "online" as const)
      .catch(() => "offline" as const);
    return await Promise.race(
      timeoutPromise ? [fetchPromise, timeoutPromise] : [fetchPromise]
    );
  } finally {
    if (timeoutId != null) {
      window.clearTimeout(timeoutId);
    }
  }
}

export async function checkOnline(): Promise<"online" | "offline"> {
  const status = await runReachabilityCheck();
  emit(status);
  return status;
}

function schedulePoll() {
  if (typeof window === "undefined") return;
  if (pollingTimer != null) {
    window.clearTimeout(pollingTimer);
  }
  const delay = currentStatus === "offline" ? OFFLINE_POLL_MS : ONLINE_POLL_MS;
  pollingTimer = window.setTimeout(async () => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      schedulePoll();
      return;
    }
    await runCheck("poll");
    schedulePoll();
  }, delay);
}

async function runCheck(reason: string): Promise<OnlineStatus> {
  if (inFlightCheck) return inFlightCheck;
  inFlightCheck = (async () => {
    const status = await runReachabilityCheck();
    emit(status);
    return status;
  })();
  try {
    return await inFlightCheck;
  } finally {
    inFlightCheck = null;
    if (reason === "online-event" && currentStatus === "online") {
      schedulePoll();
    }
  }
}

function startMonitoring() {
  if (monitoring || typeof window === "undefined") return;
  monitoring = true;

  const onOffline = () => {
    emit("offline");
    schedulePoll();
  };
  const onOnline = () => {
    void runCheck("online-event");
  };
  const onVisible = () => {
    if (document.visibilityState === "visible") {
      void runCheck("visibility");
    }
  };

  window.addEventListener("offline", onOffline);
  window.addEventListener("online", onOnline);
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onVisible);
  }

  void runCheck("start");
  schedulePoll();

  const stop = () => {
    window.removeEventListener("offline", onOffline);
    window.removeEventListener("online", onOnline);
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", onVisible);
    }
  };

  (startMonitoring as any).stop = stop;
}

function stopMonitoringIfIdle() {
  if (listeners.size > 0 || !monitoring) return;
  const stop = (startMonitoring as any).stop as (() => void) | undefined;
  if (stop) stop();
  if (pollingTimer != null && typeof window !== "undefined") {
    window.clearTimeout(pollingTimer);
  }
  pollingTimer = null;
  monitoring = false;
}

export function subscribeOnlineStatus(cb: Listener): () => void {
  listeners.add(cb);
  cb(currentStatus);
  startMonitoring();
  if (currentStatus === "unknown") {
    void runCheck("subscribe");
  }
  return () => {
    listeners.delete(cb);
    stopMonitoringIfIdle();
  };
}
