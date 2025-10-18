type SentryModule = typeof import("@sentry/react");
import { auth } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";

let sentryModule: SentryModule | null = null;
let loadPromise: Promise<SentryModule | null> | null = null;
let authUnsubscribe: (() => void) | null = null;

function getRuntimeEnvironment(): "development" | "preview" | "production" {
  if (import.meta.env.DEV || import.meta.env.MODE === "development") return "development";
  if (typeof window !== "undefined") {
    const host = window.location.hostname || "";
    if (host.includes("--")) return "preview"; // Firebase Hosting preview channels use site--channel.web.app
  }
  return "production";
}

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

  // Never initialize in development, even if DSN is set
  if (import.meta.env.DEV || import.meta.env.MODE === "development") {
    if (dsn) {
      console.log("Sentry disabled in development mode");
    }
    return;
  }

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

      const envLabel = getRuntimeEnvironment();

      Sentry.init({
        dsn,
        tracesSampleRate: 0.1,
        sampleRate: 1.0,
        environment: envLabel,
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

      // Tag environment and build for easier triage
      try {
        Sentry.setTag('environment', envLabel);
        if (release) {
          Sentry.setTag('build', release);
        }
      } catch (_) {
        // non-fatal
      }

      // Best-effort: fetch build tag written during production builds
      // scripts/print-build-tag.js writes public/build.txt with { sha, builtAtISO }
      if (typeof window !== 'undefined') {
        fetch('/build.txt')
          .then((r) => (r.ok ? r.json() : null))
          .then((json) => {
            const sha = (json && typeof json.sha === 'string' && json.sha) || '';
            if (sha) {
              try {
                Sentry.setTag('build', sha);
              } catch (_) {
                // ignore
              }
            }
          })
          .catch(() => {});
      }

      if (typeof window !== 'undefined') {
        window.addEventListener('unhandledrejection', (event) => {
          if (!event?.reason) return;
          Sentry.captureException(event.reason);
        });
      }

      // Attach Firebase Auth user if available and keep it updated
      try {
        const current = auth?.currentUser?.uid;
        if (current) {
          Sentry.setUser({ id: current });
        }
        if (authUnsubscribe) authUnsubscribe();
        authUnsubscribe = onAuthStateChanged(auth, (user) => {
          try {
            if (user?.uid) {
              Sentry.setUser({ id: user.uid });
            } else {
              Sentry.setUser(null);
            }
          } catch (_) {
            // ignore
          }
        });
      } catch (_) {
        // ignore if auth not ready
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