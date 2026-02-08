import { isCapacitorNative } from "@/lib/platform/isNative";

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
let nativeListenerStop: (() => void) | null = null;
let nativeListenerPromise: Promise<void> | null = null;

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
  if (isCapacitorNative()) {
    const nativeStatus = await getNativeNetworkStatus();
    if (nativeStatus === "offline") {
      return "offline";
    }
  }
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timeoutId =
    typeof window !== "undefined"
      ? window.setTimeout(() => controller?.abort(), CHECK_TIMEOUT_MS)
      : null;
  try {
    const { url, init } = buildProbeRequest(getProbeUrl());
    await fetch(url, {
      ...init,
      signal: controller?.signal,
    });
    return "online";
  } catch {
    return "offline";
  } finally {
    if (timeoutId != null) {
      window.clearTimeout(timeoutId);
    }
  }
}

async function getNativeNetworkStatus(): Promise<OnlineStatus | null> {
  if (!isCapacitorNative()) return null;
  try {
    const networkPlugin = (window as any)?.Capacitor?.Plugins?.Network;
    if (!networkPlugin) return null;
    const status = await networkPlugin.getStatus();
    return status.connected ? "online" : "offline";
  } catch {
    return null;
  }
}

function startNativeMonitoring() {
  if (!isCapacitorNative() || nativeListenerPromise) return;
  nativeListenerPromise = (async () => {
    try {
      const networkPlugin = (window as any)?.Capacitor?.Plugins?.Network;
      if (!networkPlugin) {
        nativeListenerPromise = null;
        return;
      }
      const handle = await networkPlugin.addListener(
        "networkStatusChange",
        (status: { connected: boolean }) => {
          emit(status.connected ? "online" : "offline");
          if (status.connected) {
            schedulePoll();
          }
        }
      );
      nativeListenerStop = () => {
        handle.remove();
      };
    } catch {
      nativeListenerPromise = null;
    }
  })();
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

  if (isCapacitorNative()) {
    startNativeMonitoring();
    void getNativeNetworkStatus().then((status) => {
      if (status) {
        emit(status);
      }
    });
  }

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
    if (nativeListenerStop) {
      nativeListenerStop();
      nativeListenerStop = null;
      nativeListenerPromise = null;
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
