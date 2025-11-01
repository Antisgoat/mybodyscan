import type { NextFunction, Request, Response } from "express";

type Middleware = (req: Request, res: Response, next: NextFunction) => unknown;

export function runMiddleware(req: Request, res: Response, middleware: Middleware): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let settled = false;

    const next: NextFunction = (error?: unknown) => {
      if (settled) {
        return;
      }
      settled = true;
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    };

    try {
      const result = middleware(req, res, next);
      if (result instanceof Promise) {
        result.catch((error) => {
          if (!settled) {
            settled = true;
            reject(error);
          }
        });
      }
    } catch (error) {
      if (!settled) {
        settled = true;
        reject(error);
      }
    }
  });
}
