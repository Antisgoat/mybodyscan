import type { Request, Response, NextFunction, RequestHandler } from "express";

export interface RateLimitRequestHandlerOptions {
  windowMs?: number;
  limit?: number;
  max?: number;
  standardHeaders?: boolean;
  legacyHeaders?: boolean;
  skip?: (req: Request, res: Response) => boolean;
  keyGenerator?: (req: Request, res: Response) => string;
  message?: unknown;
  handler?: (req: Request, res: Response, next: NextFunction, options: RateLimitRequestHandlerOptions) => void;
  onLimitReached?: (req: Request, res: Response, options: RateLimitRequestHandlerOptions) => void;
}

export declare function rateLimit(options?: RateLimitRequestHandlerOptions): RequestHandler;

export default rateLimit;
