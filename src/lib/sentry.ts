import * as Sentry from '@sentry/react';

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

  try {
    Sentry.init({
      dsn,
      // Performance Monitoring
      tracesSampleRate: 0.1, // 10% of transactions will be sent to Sentry
      // Error sampling
      sampleRate: 1.0, // 100% of errors will be sent to Sentry
      environment: import.meta.env.MODE,
      beforeSend(event) {
        // Filter out development errors in production
        if (import.meta.env.PROD && event.exception) {
          const error = event.exception.values?.[0];
          if (error?.value?.includes('ResizeObserver loop limit exceeded')) {
            return null; // Ignore ResizeObserver errors
          }
        }
        return event;
      },
    });
    
    console.log('Sentry initialized successfully');
  } catch (error) {
    console.error('Failed to initialize Sentry:', error);
  }
}

/**
 * Report error to Sentry if available
 */
export function reportError(error: Error, context?: Record<string, any>) {
  if (import.meta.env.VITE_SENTRY_DSN) {
    Sentry.captureException(error, {
      tags: context,
    });
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