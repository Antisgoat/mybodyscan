export type InitOptions = {
  dsn?: string;
  tracesSampleRate?: number;
  sampleRate?: number;
  environment?: string;
  beforeSend?: (event: any) => any;
};

export function init(options: InitOptions = {}): void {
  if (import.meta.env.DEV) {
    console.info("[sentry-fallback] init", options?.dsn ? "dsn-set" : "dsn-missing");
  }
}

export function captureException(error: unknown, context?: { tags?: Record<string, unknown> }): void {
  if (import.meta.env.DEV) {
    console.error("[sentry-fallback] captureException", error, context);
  }
}
