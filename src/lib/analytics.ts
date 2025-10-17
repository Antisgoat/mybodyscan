type AnalyticsWindow = typeof window & {
  firebaseAnalytics?: {
    getAnalytics?: () => unknown;
    logEvent?: (instance: unknown, eventName: string, params: Record<string, unknown>) => void;
  };
};

/** Lightweight analytics tracker. */
export function track(name: string, params?: Record<string, unknown>) {
  try {
    // If Firebase Analytics is set up, call logEvent; else no-op
    const analyticsApi = (window as AnalyticsWindow).firebaseAnalytics;
    const getAnalytics = analyticsApi?.getAnalytics;
    const logEvent = analyticsApi?.logEvent;
    if (typeof getAnalytics === "function" && typeof logEvent === "function") {
      const instance = getAnalytics();
      const payload = params ? { ...params } : {};
      logEvent(instance, name, payload);
    }
  } catch {
    // ignore
  }
}
