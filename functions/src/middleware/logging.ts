import type { Request, Response } from 'express';
import { captureFunctionException } from '../lib/sentry.js';

interface LogMetadata {
  fn: string;
  uid?: string | null;
  path: string;
  method: string;
  status: number;
  durationMs: number;
  code?: string;
  error?: string;
}

function redact(value: unknown): unknown {
  if (typeof value === 'string') {
    if (value.startsWith('Bearer ')) return 'REDACTED';
    if (value.length > 256) return `${value.slice(0, 64)}…`;
  }
  return value;
}

export function withRequestLogging(
  handler: (req: Request, res: Response) => Promise<void> | void,
  options: { sampleRate?: number } = {},
) {
  const sampleRate = typeof options.sampleRate === 'number' ? options.sampleRate : 1;

  return async (req: Request, res: Response) => {
    const shouldLog = Math.random() < sampleRate;
    const startedAt = Date.now();
    let errorCode: string | undefined;
    let responseStatus = 200;

    const originalStatus = res.status.bind(res);
    res.status = ((code: number) => {
      responseStatus = code;
      return originalStatus(code);
    }) as any;

    const originalJson = res.json.bind(res);
    res.json = ((body: unknown) => {
      const maybeCode = (body as any)?.code;
      if (typeof maybeCode === 'string') {
        errorCode = maybeCode;
      }
      return originalJson(body as any);
    }) as any;

    try {
      await handler(req, res);
    } catch (error: any) {
      errorCode = typeof error?.code === 'string' ? error.code : errorCode;
      void captureFunctionException(error, {
        fn: handler.name || 'handler',
        path: (req as any).path ?? req.url ?? '',
        method: req.method,
        status: responseStatus,
        code: errorCode,
      });
      // Re-throw after logging in finally
      throw error;
    } finally {
      if (shouldLog) {
        const durationMs = Date.now() - startedAt;
        const meta: LogMetadata = {
          fn: (handler.name || 'handler').replace(/bound /, ''),
          uid: (req as any).auth?.uid || (req as any).user?.uid || null,
          path: (req as any).path ?? req.url ?? '',
          method: req.method,
          status: responseStatus,
          durationMs,
          code: errorCode,
        };
        const entry = JSON.stringify(meta, (_key, value) => redact(value));
        if (responseStatus >= 500) {
          console.error(entry);
        } else {
          console.log(entry);
        }
      }
    }
  };
}
