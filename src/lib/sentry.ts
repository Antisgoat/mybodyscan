type SentryModule = typeof import("@sentry/react");

let sentryModule: SentryModule | null = null;
let loadPromise: Promise<SentryModule | null> | null = null;

async function loadSentryModule(): Promise<SentryModule | null> {
  if (sentryModule) return sentryModule;
  if (!loadPromise) {
    loadPromise = import("@sentry/react")
      .then((mod) => {
        sentryModule = mod;
        return mod;
      })
      .catch((error) => {
        console.warn("[sentry] module unavailable", error);
        return null;
      });
  }
  return loadPromise;
}

/**
 * Initialize Sentry if DSN is provided
 * This is a minimal setup that only activates when VITE_SENTRY_DSN is set
 */
export function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN;

  if (!dsn) {
    console.log('Sentry disabled - no DSN provided');
    return;
  }

  void loadSentryModule().then((Sentry) => {
    if (!Sentry) {
      console.warn('Sentry disabled - module failed to load');
      return;
    }

    try {
      const release =
        import.meta.env.VITE_SENTRY_RELEASE ||
        import.meta.env.VITE_GIT_SHA ||
        import.meta.env.VITE_COMMIT_SHA ||
        undefined;

      Sentry.init({
        dsn,
        tracesSampleRate: 0.1,
        sampleRate: 1.0,
        environment: import.meta.env.MODE,
        release,
        beforeSend(event) {
          if (import.meta.env.PROD && event.exception) {
            const error = event.exception.values?.[0];
            if (error?.value?.includes('ResizeObserver loop limit exceeded')) {
              return null;
            }
          }
          return event;
        },
      });

      if (typeof window !== 'undefined') {
        window.addEventListener('unhandledrejection', (event) => {
          if (!event?.reason) return;
          Sentry.captureException(event.reason);
        });
      }

      console.log('Sentry initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Sentry:', error);
    }
  });
}

/**
 * Report error to Sentry if available
 */
export function reportError(error: Error, context?: Record<string, any>) {
  if (import.meta.env.VITE_SENTRY_DSN) {
    if (sentryModule) {
      sentryModule.captureException(error, {
        tags: context,
      });
    } else {
      void loadSentryModule().then((Sentry) => {
        if (!Sentry) {
          console.error('Error (Sentry not available):', error, context);
          return;
        }
        Sentry.captureException(error, {
          tags: context,
        });
      });
    }
  } else {
    console.error('Error (Sentry not available):', error, context);
  }
}

/**
 * Add performance mark
 */
export function addPerformanceMark(name: string) {
  if (typeof performance !== 'undefined' && performance.mark) {
    performance.mark(name);
  }
}

/**
 * Measure performance between two marks
 */
export function measurePerformance(name: string, startMark: string, endMark?: string) {
  if (typeof performance !== 'undefined' && performance.measure) {
    try {
      const measureName = endMark ? `${name}-${startMark}-to-${endMark}` : `${name}-${startMark}`;
      performance.measure(measureName, startMark, endMark);
      
      const measures = performance.getEntriesByName(measureName);
      if (measures.length > 0) {
        const duration = measures[0].duration;
        console.log(`Performance: ${measureName} took ${duration.toFixed(2)}ms`);
      }
    } catch (error) {
      console.warn('Failed to measure performance:', error);
    }
  }
}