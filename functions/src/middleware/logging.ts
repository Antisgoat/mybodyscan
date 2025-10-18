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

export function withRequestLogging<Req extends Request = Request, Res extends Response = Response>(
  handler: (req: Req, res: Res) => Promise<void> | void,
  options: { sampleRate?: number } = {},
) {
  const sampleRate = typeof options.sampleRate === 'number' ? options.sampleRate : 1;

  return async (req: Req, res: Res) => {
    const shouldLog = Math.random() < sampleRate;
    const startedAt = Date.now();
    let finished = false;
    let errorCode: string | undefined;

    const response = res as Response & {
      statusCode?: number;
      on?: (event: string, listener: () => void) => void;
    };
    const requestPath = typeof (req as any).path === 'string' ? (req as any).path : req.url ?? '';

    const finish = (err?: unknown) => {
      if (!shouldLog || finished) return;
      finished = true;
      const durationMs = Date.now() - startedAt;
      const statusCode = typeof response.statusCode === 'number' ? response.statusCode : 200;
      const meta: LogMetadata = {
        fn: (handler.name || 'handler').replace(/bound /, ''),
        uid: (req as any).auth?.uid || (req as any).user?.uid || null,
        path: requestPath,
        method: req.method,
        status: statusCode,
        durationMs,
        code: errorCode,
      };
      if (err instanceof Error) {
        meta.error = err.message;
      } else if (typeof err === 'string') {
        meta.error = err;
      }
      const entry = JSON.stringify(meta, (_key, value) => redact(value));
      if (err) {
        console.error(entry);
      } else if (statusCode >= 500) {
        console.error(entry);
      } else {
        console.log(entry);
      }
    };

    const originalJson = res.json.bind(res);
    res.json = ((body: unknown) => {
      if ((body as any)?.code && typeof (body as any).code === 'string') {
        errorCode = (body as any).code;
      }
      return originalJson(body);
    }) as any;

    response.on?.('finish', () => finish());
    response.on?.('close', () => finish());

    try {
      await handler(req, res);
    } catch (error: any) {
      errorCode = typeof error?.code === 'string' ? error.code : errorCode;
      void captureFunctionException(error, {
        fn: handler.name || 'handler',
        path: requestPath,
        method: req.method,
        status: typeof response.statusCode === 'number' ? response.statusCode : 500,
        code: errorCode,
      });
      finish(error);
      throw error;
    }
  };
}
