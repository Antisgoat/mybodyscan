/** Lightweight analytics tracker. */
export function track(name: string, params?: Record<string, any>) {
  try {
    // If Firebase Analytics is set up, call logEvent; else no-op
    const { getAnalytics, logEvent } = (window as any)?.firebaseAnalytics || {};
    if (getAnalytics && logEvent) {
      logEvent(getAnalytics(), name, params || {});
    }
  } catch {
    // ignore
  }
}
