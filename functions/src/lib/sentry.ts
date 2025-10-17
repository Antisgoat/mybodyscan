let sentryModule: any | null = null;
let initPromise: Promise<any | null> | null = null;

function getReleaseTag(): string | undefined {
  return process.env.SENTRY_RELEASE || process.env.GIT_SHA || process.env.COMMIT_SHA || undefined;
}

async function loadSentry(): Promise<any | null> {
  if (sentryModule) return sentryModule;
  if (initPromise) return initPromise;

  initPromise = import('@sentry/node')
    .then((mod) => {
      const dsn = process.env.SENTRY_DSN;
      if (!dsn) {
        return null;
      }
      mod.init({
        dsn,
        tracesSampleRate: 0,
        environment: process.env.GCLOUD_PROJECT || process.env.FUNCTION_TARGET,
        release: getReleaseTag(),
      });
      sentryModule = mod;
      return mod;
    })
    .catch(() => null);

  return initPromise;
}

export async function captureFunctionException(error: unknown, context?: Record<string, unknown>): Promise<void> {
  const mod = await loadSentry();
  if (!mod) return;
  try {
    mod.captureException(error, { tags: context ?? {} });
  } catch {
    // swallow
  }
}

export async function flushSentry(timeout = 2000): Promise<void> {
  const mod = await loadSentry();
  if (!mod) return;
  try {
    await mod.flush(timeout);
  } catch {
    // ignore
  }
}
